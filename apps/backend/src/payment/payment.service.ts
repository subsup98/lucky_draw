import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const INTENT_TTL_SECONDS = 5 * 60;
const PROVIDER_MOCK = 'mock';

interface IntentPayload {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  exp: number; // epoch seconds
}

@Injectable()
export class PaymentService {
  private readonly intentSecret: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.intentSecret =
      process.env.PAYMENT_INTENT_SECRET ?? 'dev_payment_intent_secret_change_me';
    this.webhookSecret =
      process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev_payment_webhook_secret_change_me';
  }

  // -----------------------------------------------------------------------
  // 1. Intent 발급
  // -----------------------------------------------------------------------
  async createIntent(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true, totalAmount: true },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new ForbiddenException();
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException(`order not payable: ${order.status}`);
    }

    const id = 'pi_' + randomBytes(16).toString('hex');
    const exp = Math.floor(Date.now() / 1000) + INTENT_TTL_SECONDS;
    const payload: IntentPayload = {
      id,
      orderId: order.id,
      userId,
      amount: order.totalAmount,
      exp,
    };
    const signature = this.signIntent(payload);

    await this.redis.set(
      this.intentKey(id),
      JSON.stringify(payload),
      'EX',
      INTENT_TTL_SECONDS,
    );

    return {
      paymentIntentId: id,
      amount: order.totalAmount,
      signature,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  // -----------------------------------------------------------------------
  // 2. Client confirm
  // -----------------------------------------------------------------------
  async confirm(
    userId: string,
    body: { paymentIntentId: string; signature: string; providerTxId: string },
  ) {
    const raw = await this.redis.get(this.intentKey(body.paymentIntentId));
    if (!raw) throw new BadRequestException('intent expired or unknown');

    const payload = JSON.parse(raw) as IntentPayload;
    if (payload.userId !== userId) throw new ForbiddenException();
    if (payload.exp * 1000 < Date.now()) {
      await this.redis.del(this.intentKey(body.paymentIntentId));
      throw new BadRequestException('intent expired');
    }

    // HMAC 검증
    const expected = this.signIntent(payload);
    const got = Buffer.from(body.signature);
    const exp = Buffer.from(expected);
    if (got.length !== exp.length || !timingSafeEqual(got, exp)) {
      throw new UnauthorizedException('bad intent signature');
    }

    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        // Order 현재 상태를 락 걸고 검증
        const [order] = await tx.$queryRaw<
          Array<{ id: string; status: string; totalAmount: number; userId: string }>
        >`
          SELECT "id", "status", "totalAmount", "userId"
            FROM "Order"
           WHERE "id" = ${payload.orderId}
           FOR UPDATE
        `;
        if (!order) throw new NotFoundException('order not found');
        if (order.userId !== userId) throw new ForbiddenException();
        if (order.totalAmount !== payload.amount) {
          throw new BadRequestException('amount mismatch');
        }
        if (order.status !== 'PENDING_PAYMENT') {
          // 이미 PAID 라면 멱등적으로 성공
          if (order.status === 'PAID') {
            const existing = await tx.payment.findUnique({
              where: { orderId: order.id },
            });
            if (existing) return existing;
          }
          throw new ConflictException(`order not payable: ${order.status}`);
        }

        // Payment 생성 — Payment.orderId UNIQUE / providerTxId UNIQUE 로 중복 방지
        const created = await tx.payment.create({
          data: {
            orderId: order.id,
            provider: PROVIDER_MOCK,
            providerTxId: body.providerTxId,
            amount: order.totalAmount,
            method: 'CARD',
            status: 'PAID',
            paidAt: new Date(),
            rawResponse: {
              source: 'client_confirm',
              intentId: body.paymentIntentId,
              providerTxId: body.providerTxId,
            } as Prisma.InputJsonValue,
          },
        });

        // Order 원자 전이: PENDING_PAYMENT → PAID
        const updated = await tx.$executeRaw`
          UPDATE "Order"
             SET "status"   = 'PAID',
                 "paidAt"   = ${new Date()},
                 "updatedAt"= ${new Date()}
           WHERE "id" = ${order.id}
             AND "status" = 'PENDING_PAYMENT'
        `;
        if (updated === 0) {
          throw new ConflictException('order state changed concurrently');
        }

        return created;
      });

      // intent 1회 소비
      await this.redis.del(this.intentKey(body.paymentIntentId));
      return this.serializePayment(payment);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // 동일 orderId 또는 providerTxId 중복 → 기존 Payment 조회해서 멱등 응답
        const existing = await this.prisma.payment.findUnique({
          where: { orderId: payload.orderId },
        });
        if (existing && existing.providerTxId === body.providerTxId) {
          await this.redis.del(this.intentKey(body.paymentIntentId));
          return this.serializePayment(existing);
        }
        throw new ConflictException('payment already finalized');
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // 3. Webhook 이중 검증 — 동일 결과를 독립 경로로 재확인
  //    서명: HMAC-SHA256(`${orderId}.${providerTxId}.${status}`) — 실 PG는 바디 서명 사용.
  // -----------------------------------------------------------------------
  async webhook(
    body: { providerTxId: string; orderId: string; status: string },
    signatureHeader: string | undefined,
  ) {
    if (!signatureHeader) throw new UnauthorizedException('missing signature');
    if (body.status !== 'PAID' && body.status !== 'FAILED' && body.status !== 'CANCELLED') {
      throw new BadRequestException(`unsupported status: ${body.status}`);
    }
    const expected = this.signWebhookBody(body);
    const got = Buffer.from(signatureHeader);
    const exp = Buffer.from(expected);
    if (got.length !== exp.length || !timingSafeEqual(got, exp)) {
      throw new UnauthorizedException('bad webhook signature');
    }

    // 이미 처리된 webhook(또는 client confirm 이 먼저 처리됨) → 멱등 성공
    const existing = await this.prisma.payment.findFirst({
      where: { providerTxId: body.providerTxId },
    });
    if (existing) {
      return { ok: true, alreadyProcessed: true, paymentId: existing.id };
    }

    if (body.status !== 'PAID') {
      // 실패/취소는 Payment row 없이 Order FAILED 로만 전이
      await this.prisma.$executeRaw`
        UPDATE "Order"
           SET "status"="FAILED", "updatedAt"=${new Date()}
         WHERE "id" = ${body.orderId} AND "status" = 'PENDING_PAYMENT'
      `;
      return { ok: true, orderStatus: 'FAILED' };
    }

    // client confirm 이 아직 안 온 경우: webhook 이 먼저 도착 → 서버가 확정 처리
    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        const [order] = await tx.$queryRaw<
          Array<{ id: string; status: string; totalAmount: number }>
        >`
          SELECT "id", "status", "totalAmount" FROM "Order"
           WHERE "id" = ${body.orderId} FOR UPDATE
        `;
        if (!order) throw new NotFoundException('order not found');
        if (order.status === 'PAID') {
          const existingPay = await tx.payment.findUnique({ where: { orderId: order.id } });
          if (existingPay) return existingPay;
        }
        if (order.status !== 'PENDING_PAYMENT' && order.status !== 'PAID') {
          throw new ConflictException(`order not payable: ${order.status}`);
        }

        const created = await tx.payment.create({
          data: {
            orderId: order.id,
            provider: PROVIDER_MOCK,
            providerTxId: body.providerTxId,
            amount: order.totalAmount,
            status: 'PAID',
            method: 'CARD',
            paidAt: new Date(),
            rawResponse: { source: 'webhook', providerTxId: body.providerTxId } as Prisma.InputJsonValue,
          },
        });
        await tx.$executeRaw`
          UPDATE "Order"
             SET "status"='PAID', "paidAt"=${new Date()}, "updatedAt"=${new Date()}
           WHERE "id" = ${order.id} AND "status" = 'PENDING_PAYMENT'
        `;
        return created;
      });
      return { ok: true, paymentId: payment.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existingPay = await this.prisma.payment.findUnique({ where: { orderId: body.orderId } });
        return { ok: true, alreadyProcessed: true, paymentId: existingPay?.id };
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // 4. 조회
  // -----------------------------------------------------------------------
  async findByOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new ForbiddenException();

    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new NotFoundException('payment not found');
    return this.serializePayment(payment);
  }

  // -----------------------------------------------------------------------
  // 내부 유틸
  // -----------------------------------------------------------------------

  /** 테스트·개발용: webhook 바디 서명을 계산해서 반환 */
  signWebhookBody(body: { orderId: string; providerTxId: string; status: string }) {
    const msg = `${body.orderId}.${body.providerTxId}.${body.status}`;
    return createHmac('sha256', this.webhookSecret).update(msg).digest('hex');
  }

  private signIntent(payload: IntentPayload) {
    const msg = `${payload.id}.${payload.orderId}.${payload.userId}.${payload.amount}.${payload.exp}`;
    return createHmac('sha256', this.intentSecret).update(msg).digest('hex');
  }

  private intentKey(id: string) {
    return `pay:intent:${id}`;
  }

  private serializePayment(p: Prisma.PaymentGetPayload<{}>) {
    return {
      id: p.id,
      orderId: p.orderId,
      provider: p.provider,
      providerTxId: p.providerTxId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      method: p.method,
      paidAt: p.paidAt,
      requestedAt: p.requestedAt,
    };
  }
}
