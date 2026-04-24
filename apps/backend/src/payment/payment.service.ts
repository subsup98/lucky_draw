import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService, type AuditContext } from '../audit-log/audit-log.service';
import { DrawService } from '../draw/draw.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  WebhookEvent,
  WebhookInput,
} from './providers/payment-provider';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly draw: DrawService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * PAID 전이 직후 자동 추첨. 별도 트랜잭션(중첩 회피).
   * 추첨 실패는 결제 응답을 깨뜨리지 않음 — Order는 PAID 잔류, `POST /orders/:id/draw` 비상 재시도 경로 유지.
   */
  private async autoDraw(userId: string, orderId: string, ctx?: AuditContext) {
    try {
      return await this.draw.execute(userId, orderId, ctx);
    } catch (err) {
      this.logger.warn(
        `auto-draw failed orderId=${orderId} err=${(err as Error).message} — order remains PAID, manual retry available via POST /orders/:id/draw`,
      );
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // 1. Intent/Initiation — provider별로 클라이언트에 돌려줄 페이로드가 다름.
  //    mock: {paymentIntentId, signature, ...} / toss: {clientKey, orderId, amount, orderName}
  // -----------------------------------------------------------------------
  async createIntent(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        totalAmount: true,
        kujiEvent: { select: { title: true } },
      },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new ForbiddenException();
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException(`order not payable: ${order.status}`);
    }

    const result = await this.provider.initiate({
      orderId: order.id,
      userId,
      amount: order.totalAmount,
      orderName: order.kujiEvent?.title ?? 'kuji order',
    });
    return { provider: result.provider, ...result.payload };
  }

  // -----------------------------------------------------------------------
  // 2. Confirm — provider.confirm 으로 외부 검증 → DB 트랜잭션으로 Payment 생성 + Order 전이
  // -----------------------------------------------------------------------
  async confirm(
    userId: string,
    params: Record<string, unknown>,
    ctx?: AuditContext,
  ) {
    // Order 잠금 전에 금액 읽기 — 공격자가 임의 금액을 넘기지 못하게 expected 는 서버가 계산
    const order = await this.prisma.order.findUnique({
      where: { id: String(params.orderId ?? '') },
      select: { id: true, userId: true, status: true, totalAmount: true },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new ForbiddenException();

    // 이미 PAID/DRAWN 이면 기존 Payment + (있다면) 추첨 결과 멱등 반환
    if (order.status === 'PAID' || order.status === 'DRAWN') {
      const existing = await this.prisma.payment.findUnique({ where: { orderId: order.id } });
      if (existing) {
        const drawResults =
          order.status === 'DRAWN' ? await this.draw.findByOrder(userId, order.id) : null;
        return { ...this.serializePayment(existing), drawResults };
      }
    }
    if (order.status !== 'PENDING_PAYMENT' && order.status !== 'PAID') {
      throw new ConflictException(`order not payable: ${order.status}`);
    }

    const external = await this.provider.confirm({
      orderId: order.id,
      userId,
      expectedAmount: order.totalAmount,
      params,
    });

    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<
          Array<{ id: string; status: string; totalAmount: number; userId: string }>
        >`
          SELECT "id", "status", "totalAmount", "userId" FROM "Order"
           WHERE "id" = ${order.id} FOR UPDATE
        `;
        if (!locked) throw new NotFoundException('order not found');
        if (locked.userId !== userId) throw new ForbiddenException();
        if (locked.totalAmount !== external.amount) {
          throw new BadRequestException('amount mismatch');
        }
        if (locked.status === 'PAID') {
          const existing = await tx.payment.findUnique({ where: { orderId: locked.id } });
          if (existing) return existing;
        }
        if (locked.status !== 'PENDING_PAYMENT' && locked.status !== 'PAID') {
          throw new ConflictException(`order not payable: ${locked.status}`);
        }

        const created = await tx.payment.create({
          data: {
            orderId: locked.id,
            provider: this.provider.name,
            providerTxId: external.providerTxId,
            amount: external.amount,
            method: external.method ?? 'CARD',
            status: 'PAID',
            paidAt: external.paidAt,
            rawResponse: external.rawResponse as Prisma.InputJsonValue,
          },
        });

        const updated = await tx.$executeRaw`
          UPDATE "Order"
             SET "status"='PAID', "paidAt"=${external.paidAt}, "updatedAt"=${new Date()}
           WHERE "id" = ${locked.id} AND "status"='PENDING_PAYMENT'
        `;
        if (updated === 0 && locked.status !== 'PAID') {
          throw new ConflictException('order state changed concurrently');
        }
        return created;
      });

      void this.audit.record({
        actorType: 'USER',
        actorUserId: userId,
        action: 'PAYMENT_CONFIRM',
        targetType: 'Payment',
        targetId: payment.id,
        ctx,
        metadata: {
          orderId: payment.orderId,
          provider: this.provider.name,
          providerTxId: external.providerTxId,
          amount: external.amount,
          source: 'client_confirm',
        },
      });
      const drawResults = await this.autoDraw(userId, payment.orderId, ctx);
      return { ...this.serializePayment(payment), drawResults };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.payment.findUnique({ where: { orderId: order.id } });
        if (existing && existing.providerTxId === external.providerTxId) {
          const drawResults = await this.autoDraw(userId, existing.orderId, ctx);
          return { ...this.serializePayment(existing), drawResults };
        }
        throw new ConflictException('payment already finalized');
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // 3. Webhook — provider.verifyWebhook 에서 서명 검증 + 표준 이벤트로 변환.
  //    rawBody 가 서명 검증의 진실값이므로 controller 에서 raw 를 그대로 전달.
  // -----------------------------------------------------------------------
  async webhook(input: WebhookInput, ctx?: AuditContext) {
    const event: WebhookEvent = await this.provider.verifyWebhook(input);

    const existing = await this.prisma.payment.findFirst({
      where: { providerTxId: event.providerTxId },
    });
    if (existing) {
      return { ok: true, alreadyProcessed: true, paymentId: existing.id };
    }

    if (event.status !== 'PAID') {
      await this.prisma.$executeRaw`
        UPDATE "Order"
           SET "status"='FAILED', "updatedAt"=${new Date()}
         WHERE "id" = ${event.orderId} AND "status"='PENDING_PAYMENT'
      `;
      return { ok: true, orderStatus: 'FAILED' };
    }

    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        const [order] = await tx.$queryRaw<
          Array<{ id: string; status: string; totalAmount: number }>
        >`
          SELECT "id", "status", "totalAmount" FROM "Order"
           WHERE "id" = ${event.orderId} FOR UPDATE
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
            provider: this.provider.name,
            providerTxId: event.providerTxId,
            amount: order.totalAmount,
            status: 'PAID',
            method: 'CARD',
            paidAt: new Date(),
            rawResponse: event.rawResponse as Prisma.InputJsonValue,
          },
        });
        await tx.$executeRaw`
          UPDATE "Order"
             SET "status"='PAID', "paidAt"=${new Date()}, "updatedAt"=${new Date()}
           WHERE "id" = ${order.id} AND "status"='PENDING_PAYMENT'
        `;
        return created;
      });

      void this.audit.record({
        actorType: 'SYSTEM',
        action: 'PAYMENT_WEBHOOK_CONFIRM',
        targetType: 'Payment',
        targetId: payment.id,
        ctx,
        metadata: {
          orderId: event.orderId,
          provider: this.provider.name,
          providerTxId: event.providerTxId,
          source: 'webhook',
        },
      });
      // 자동 추첨 — webhook 단독 확정이라도 사용자가 다시 들어와 클릭 안 해도 결과 확정.
      const orderOwner = await this.prisma.order.findUnique({
        where: { id: payment.orderId },
        select: { userId: true },
      });
      if (orderOwner) await this.autoDraw(orderOwner.userId, payment.orderId, ctx);
      return { ok: true, paymentId: payment.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existingPay = await this.prisma.payment.findUnique({
          where: { orderId: event.orderId },
        });
        return { ok: true, alreadyProcessed: true, paymentId: existingPay?.id };
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // 4. Refund (admin only) — 소프트 환불.
  //    - PAID/DRAWN 만 허용. SHIPPED 이후·이미 REFUNDED·CANCELLED 거부.
  //    - Shipment 가 PENDING 이 아니면(=발송 시작) 거부.
  //    - 재고/DrawResult/soldTickets 는 건드리지 않는다 (라스트원·감사 일관성 보존).
  //    - PG refund(외부 호출)는 트랜잭션 밖에서 먼저 호출. 실패 시 DB 변경 없음.
  //      DB tx 실패 시 → PG 는 환불됐는데 우리 상태는 남는 위험 → Logger.error 로
  //      운영자 수기 정합성 복구 신호.
  // -----------------------------------------------------------------------
  async refundByAdmin(
    adminId: string,
    orderId: string,
    reason: string,
    ctx?: AuditContext,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, shipment: true },
    });
    if (!order) throw new NotFoundException('order not found');
    if (!order.payment) throw new ConflictException('no payment to refund');
    if (order.status !== 'PAID' && order.status !== 'DRAWN') {
      throw new ConflictException(`cannot refund order in state: ${order.status}`);
    }
    if (order.payment.status === 'REFUNDED') {
      throw new ConflictException('already refunded');
    }
    if (order.shipment && order.shipment.status !== 'PENDING') {
      throw new ConflictException(
        `shipment already in progress: ${order.shipment.status}`,
      );
    }
    if (!order.payment.providerTxId) {
      throw new ConflictException('payment has no providerTxId');
    }

    const result = await this.provider.refund({
      providerTxId: order.payment.providerTxId,
      amount: order.payment.amount,
      reason,
    });

    const previousOrderStatus = order.status;
    try {
      await this.prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<
          Array<{ id: string; status: string }>
        >`
          SELECT "id", "status" FROM "Order"
           WHERE "id" = ${orderId} FOR UPDATE
        `;
        if (!locked) throw new NotFoundException('order not found');
        if (locked.status !== 'PAID' && locked.status !== 'DRAWN') {
          throw new ConflictException(`cannot refund order in state: ${locked.status}`);
        }

        const existingRaw =
          (order.payment!.rawResponse as Prisma.JsonObject | null) ?? {};
        await tx.payment.update({
          where: { orderId },
          data: {
            status: 'REFUNDED',
            refundedAt: result.refundedAt,
            refundReason: reason,
            refundedByAdminId: adminId,
            rawResponse: {
              ...existingRaw,
              refund: result.rawResponse as Prisma.InputJsonValue,
            } as Prisma.InputJsonValue,
          },
        });
        await tx.$executeRaw`
          UPDATE "Order"
             SET "status"='REFUNDED', "updatedAt"=${new Date()}
           WHERE "id" = ${orderId}
        `;
        if (order.shipment) {
          await tx.shipment.update({
            where: { id: order.shipment.id },
            data: { status: 'CANCELLED' },
          });
        }
      });
    } catch (err) {
      this.logger.error(
        `REFUND_DB_INCONSISTENCY orderId=${orderId} paymentKey=${order.payment.providerTxId} ` +
          `PG refunded but DB update failed: ${(err as Error).message} — manual reconciliation required`,
      );
      throw err;
    }

    void this.audit.record({
      actorType: 'ADMIN',
      adminUserId: adminId,
      action: 'PAYMENT_REFUND',
      targetType: 'Payment',
      targetId: order.payment.id,
      ctx,
      metadata: {
        orderId,
        previousOrderStatus,
        amount: order.payment.amount,
        reason,
        provider: order.payment.provider,
        providerTxId: order.payment.providerTxId,
        shipmentCancelled: !!order.shipment,
      },
    });

    const refreshed = await this.prisma.payment.findUnique({ where: { orderId } });
    return {
      ...this.serializePayment(refreshed!),
      orderStatus: 'REFUNDED',
      previousOrderStatus,
      refundedAt: refreshed!.refundedAt,
      refundReason: refreshed!.refundReason,
    };
  }

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
