import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService, type AuditContext } from '../audit-log/audit-log.service';
import { FieldCipherService } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StockService } from '../stock/stock.service';
import { CreateOrderDto } from './dto/create-order.dto';

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24; // 24h
const IDEMPOTENCY_LOCK_TTL_SECONDS = 30;

interface CachedIdempotentResponse {
  status: number;
  body: unknown;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditLogService,
    private readonly stock: StockService,
    private readonly cipher: FieldCipherService,
  ) {}

  async create(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
    ctx?: AuditContext,
  ): Promise<{ status: number; body: unknown }> {
    const cacheKey = this.idempotencyCacheKey(userId, idempotencyKey);
    const lockKey = this.idempotencyLockKey(userId, idempotencyKey);

    // 1) Idempotency 캐시 적중 → 최초 응답 그대로 반환
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as CachedIdempotentResponse;
    }

    // 2) 동일 키 동시 요청 방어: SET NX
    const acquired = await this.redis.set(
      lockKey,
      '1',
      'EX',
      IDEMPOTENCY_LOCK_TTL_SECONDS,
      'NX',
    );
    if (!acquired) {
      // 동시 요청이 처리 중. 클라이언트는 잠시 후 재시도.
      throw new ConflictException('duplicate request in flight');
    }

    try {
      // 캐시 경합 보호: 락 획득 직후 한 번 더 확인
      const cachedAfterLock = await this.redis.get(cacheKey);
      if (cachedAfterLock) {
        return JSON.parse(cachedAfterLock) as CachedIdempotentResponse;
      }

      const response = await this.createTransactional(userId, dto, idempotencyKey);
      await this.redis.set(cacheKey, JSON.stringify(response), 'EX', IDEMPOTENCY_TTL_SECONDS);
      // 신규 생성 시에만 감사 기록(멱등 재요청·기존 주문 반환은 생략)
      if (response.status === 201) {
        const body = response.body as { id?: string; ticketCount?: number; totalAmount?: number; kujiEventId?: string };
        void this.audit.record({
          actorType: 'USER',
          actorUserId: userId,
          action: 'ORDER_CREATE',
          targetType: 'Order',
          targetId: body.id ?? null,
          ctx,
          metadata: {
            kujiEventId: body.kujiEventId,
            ticketCount: body.ticketCount,
            totalAmount: body.totalAmount,
            idempotencyKey,
          },
        });
      }
      return response;
    } finally {
      await this.redis.del(lockKey).catch((err) => {
        this.logger.warn(`failed to release idempotency lock: ${String(err)}`);
      });
    }
  }

  private async createTransactional(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<CachedIdempotentResponse> {
    // Idempotency Key가 DB에 이미 있으면 그 주문을 그대로 반환(최초 응답과 동치)
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      select: this.orderSelect(),
    });
    if (existing) {
      if (existing.userId !== userId) {
        // 타 사용자 키 재사용 — 공격/오남용 가능성. 절대 공유 금지.
        throw new ConflictException('idempotency key conflict');
      }
      return { status: 200, body: this.serializeOrder(existing) };
    }

    // 픽앤팝(v2): ticketIds 가 있으면 사전 점유한 자리를 기반으로 주문 생성.
    // 기존 랜덤 추첨 흐름(v1)과 코드 분기.
    if (dto.ticketIds && dto.ticketIds.length > 0) {
      return this.createWithTicketsTransactional(userId, dto, idempotencyKey);
    }
    if (!dto.ticketCount) {
      throw new BadRequestException('ticketCount or ticketIds required');
    }

    const now = new Date();
    const ticketCount = dto.ticketCount;

    // Redis 1차 게이트 — DB CAS 이전에 빠르게 out-of-stock 차단.
    const gate = await this.stock.reserve(dto.kujiEventId, ticketCount);
    if (!gate.ok) {
      if (gate.reason === 'out_of_stock') {
        throw new ConflictException('out of stock');
      }
      if (gate.reason === 'not_found') {
        throw new NotFoundException('kuji not found');
      }
    }
    // 이 지점 이후에 throw 되는 모든 경로는 Redis 를 복구해야 한다.
    const releaseOnFail = async () => {
      if (gate.ok && gate.gated) {
        await this.stock.release(dto.kujiEventId, ticketCount);
      }
    };

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // 1) 이벤트 상태 검증 + soldTickets 원자적 증가.
        //    affected rows == 0 이면 재고 부족 / 판매중 아님 / 판매 기간 밖.
        const updated = await tx.$executeRaw<number>`
          UPDATE "KujiEvent"
             SET "soldTickets" = "soldTickets" + ${ticketCount},
                 "updatedAt"   = ${now}
           WHERE "id" = ${dto.kujiEventId}
             AND "status" = 'ON_SALE'
             AND "saleStartAt" <= ${now}
             AND "saleEndAt"   >= ${now}
             AND "soldTickets" + ${ticketCount} <= "totalTickets"
        `;
        if (updated === 0) {
          // 어느 조건이 실패했는지 구체화
          const ev = await tx.kujiEvent.findUnique({
            where: { id: dto.kujiEventId },
            select: {
              id: true,
              status: true,
              saleStartAt: true,
              saleEndAt: true,
              totalTickets: true,
              soldTickets: true,
              perUserLimit: true,
              pricePerTicket: true,
            },
          });
          if (!ev) throw new NotFoundException('kuji not found');
          if (ev.status !== 'ON_SALE') {
            throw new BadRequestException(`kuji not on sale: ${ev.status}`);
          }
          if (ev.saleStartAt > now || ev.saleEndAt < now) {
            throw new BadRequestException('kuji sale window closed');
          }
          throw new ConflictException('out of stock');
        }

        // 2) 이벤트 정보(가격·perUserLimit) 조회 — 업데이트 이후 값이어도 필드가 바뀌지 않음.
        const event = await tx.kujiEvent.findUnique({
          where: { id: dto.kujiEventId },
          select: { pricePerTicket: true, perUserLimit: true },
        });
        if (!event) throw new NotFoundException('kuji not found');

        // 3) perUserLimit 검증 — 동일 사용자의 활성 주문 합산.
        if (event.perUserLimit != null) {
          const agg = await tx.order.aggregate({
            where: {
              userId,
              kujiEventId: dto.kujiEventId,
              status: { notIn: ['CANCELLED', 'FAILED', 'REFUNDED'] },
            },
            _sum: { ticketCount: true },
          });
          const already = agg._sum.ticketCount ?? 0;
          if (already + ticketCount > event.perUserLimit) {
            throw new BadRequestException(
              `per-user limit exceeded (limit=${event.perUserLimit}, already=${already})`,
            );
          }
        }

        // 4) Order 생성
        const totalAmount = event.pricePerTicket * ticketCount;
        const order = await tx.order.create({
          data: {
            userId,
            kujiEventId: dto.kujiEventId,
            ticketCount: ticketCount,
            unitPrice: event.pricePerTicket,
            totalAmount,
            status: 'PENDING_PAYMENT',
            idempotencyKey,
            shippingSnapshot: this.cipher.encryptJson(
              {
                ...dto.shippingAddress,
                capturedAt: now.toISOString(),
              },
              FieldCipherService.aad('Order', 'shippingSnapshot'),
            ) as unknown as Prisma.JsonObject,
          },
          select: this.orderSelect(),
        });

        return order;
      });

      return { status: 201, body: this.serializeOrder(created) };
    } catch (err) {
      // UNIQUE(idempotencyKey) 경합 — 극단적 병렬 재시도. 기 생성된 주문 반환.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const dup = await this.prisma.order.findUnique({
          where: { idempotencyKey },
          select: this.orderSelect(),
        });
        if (dup && dup.userId === userId) {
          // 기존 주문이 이미 재고를 점유하고 있으므로 이번 reserve 분은 반환.
          await releaseOnFail();
          return { status: 200, body: this.serializeOrder(dup) };
        }
      }
      // 모든 실패 경로(validation·재고·락 경합 등)에서 Redis 복구
      await releaseOnFail();
      throw err;
    }
  }

  /**
   * v2 픽앤팝 흐름: 사전에 reserve 된 ticketIds 를 결제 주문에 연결.
   * - tickets 모두 RESERVED + 이 user 소유 + 만료 안 됨 + 동일 kuji 검증
   * - tickets 에 orderId 마킹 (status 는 RESERVED 유지 → 결제 후 draw 단계에서 SOLD)
   * - KujiEvent.soldTickets 증가 (v1 과 동일 시점)
   * - Inventory 차감은 안 함 (사전 셔플이라 자리별 prizeTier 가 이미 확정)
   */
  private async createWithTicketsTransactional(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<CachedIdempotentResponse> {
    const ticketIds = dto.ticketIds!;
    const now = new Date();

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // 1) 대상 ticket 락 + 검증
        const tickets = await tx.$queryRaw<
          Array<{
            id: string;
            kujiEventId: string;
            position: number;
            status: 'AVAILABLE' | 'RESERVED' | 'SOLD';
            reservedByUserId: string | null;
            reserveExpiresAt: Date | null;
            orderId: string | null;
          }>
        >`
          SELECT "id","kujiEventId","position","status","reservedByUserId","reserveExpiresAt","orderId"
            FROM "Ticket"
           WHERE "id" IN (${Prisma.join(ticketIds)})
           FOR UPDATE
        `;
        if (tickets.length !== ticketIds.length) {
          throw new NotFoundException('일부 자리가 존재하지 않습니다');
        }
        for (const t of tickets) {
          if (t.kujiEventId !== dto.kujiEventId) {
            throw new BadRequestException('자리가 해당 쿠지에 속하지 않습니다');
          }
          if (t.status !== 'RESERVED') {
            throw new ConflictException(`${t.position}번 자리가 점유 상태가 아님`);
          }
          if (t.reservedByUserId !== userId) {
            throw new ForbiddenException('자기 자리가 아닙니다');
          }
          if (!t.reserveExpiresAt || t.reserveExpiresAt < now) {
            throw new ConflictException('점유 만료 — 다시 선택해주세요');
          }
          if (t.orderId && t.orderId !== null) {
            throw new ConflictException('이미 주문에 묶인 자리');
          }
        }

        // 2) 쿠지 상태/가격
        const event = await tx.kujiEvent.findUnique({
          where: { id: dto.kujiEventId },
          select: {
            id: true,
            status: true,
            saleStartAt: true,
            saleEndAt: true,
            totalTickets: true,
            soldTickets: true,
            pricePerTicket: true,
            perUserLimit: true,
          },
        });
        if (!event) throw new NotFoundException('kuji not found');
        if (event.status !== 'ON_SALE') {
          throw new BadRequestException(`kuji not on sale: ${event.status}`);
        }
        if (event.saleStartAt > now || event.saleEndAt < now) {
          throw new BadRequestException('kuji sale window closed');
        }

        const ticketCount = ticketIds.length;

        // 3) perUserLimit
        if (event.perUserLimit != null) {
          const agg = await tx.order.aggregate({
            where: {
              userId,
              kujiEventId: dto.kujiEventId,
              status: { notIn: ['CANCELLED', 'FAILED', 'REFUNDED'] },
            },
            _sum: { ticketCount: true },
          });
          const already = agg._sum.ticketCount ?? 0;
          if (already + ticketCount > event.perUserLimit) {
            throw new BadRequestException(
              `per-user limit exceeded (limit=${event.perUserLimit}, already=${already})`,
            );
          }
        }

        // 4) soldTickets 원자 증가 + 범위 가드
        const updated = await tx.$executeRaw<number>`
          UPDATE "KujiEvent"
             SET "soldTickets" = "soldTickets" + ${ticketCount},
                 "updatedAt"   = ${now}
           WHERE "id" = ${dto.kujiEventId}
             AND "soldTickets" + ${ticketCount} <= "totalTickets"
        `;
        if (updated === 0) {
          throw new ConflictException('out of stock');
        }

        // 5) Order 생성
        const totalAmount = event.pricePerTicket * ticketCount;
        const order = await tx.order.create({
          data: {
            userId,
            kujiEventId: dto.kujiEventId,
            ticketCount,
            unitPrice: event.pricePerTicket,
            totalAmount,
            status: 'PENDING_PAYMENT',
            idempotencyKey,
            shippingSnapshot: this.cipher.encryptJson(
              {
                ...dto.shippingAddress,
                capturedAt: now.toISOString(),
              },
              FieldCipherService.aad('Order', 'shippingSnapshot'),
            ) as unknown as Prisma.JsonObject,
          },
          select: this.orderSelect(),
        });

        // 6) 티켓에 orderId 마킹 (status 는 RESERVED 유지)
        await tx.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: { orderId: order.id },
        });

        return order;
      });

      return { status: 201, body: this.serializeOrder(created) };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const dup = await this.prisma.order.findUnique({
          where: { idempotencyKey },
          select: this.orderSelect(),
        });
        if (dup && dup.userId === userId) {
          return { status: 200, body: this.serializeOrder(dup) };
        }
      }
      throw err;
    }
  }

  async findOne(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: this.orderSelect(),
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new ForbiddenException();
    return this.serializeOrder(order);
  }

  async list(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: this.orderSelect(),
    });
    return orders.map((o) => this.serializeOrder(o));
  }

  /**
   * PENDING_PAYMENT 상태의 주문을 취소하고, 이벤트 soldTickets 을 원상복귀.
   * 이미 결제된 주문은 결제 도메인의 환불 플로우로 처리 — 여기선 거부.
   */
  async cancel(userId: string, orderId: string, ctx?: AuditContext) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          userId: true,
          kujiEventId: true,
          ticketCount: true,
          status: true,
        },
      });
      if (!order) throw new NotFoundException('order not found');
      if (order.userId !== userId) throw new ForbiddenException();
      if (order.status !== 'PENDING_PAYMENT') {
        throw new ConflictException(`cannot cancel: status=${order.status}`);
      }

      // 원자적 상태 전이 — WHERE status = PENDING_PAYMENT 로 경합 방지
      const updated = await tx.$executeRaw<number>`
        UPDATE "Order"
           SET "status" = 'CANCELLED',
               "cancelledAt" = ${new Date()},
               "updatedAt"   = ${new Date()}
         WHERE "id" = ${orderId}
           AND "status" = 'PENDING_PAYMENT'
      `;
      if (updated === 0) {
        // 누군가(결제 webhook 등)가 먼저 상태를 바꿈.
        throw new ConflictException('order state changed concurrently');
      }

      // 재고(soldTickets) 복구
      await tx.$executeRaw`
        UPDATE "KujiEvent"
           SET "soldTickets" = "soldTickets" - ${order.ticketCount},
               "updatedAt"   = ${new Date()}
         WHERE "id" = ${order.kujiEventId}
      `;

      return tx.order.findUnique({
        where: { id: orderId },
        select: this.orderSelect(),
      });
    });

    if (!result) throw new ServiceUnavailableException('order not found after cancel');
    // Redis 1차 카운터도 복구 (DB soldTickets 복구와 별개)
    await this.stock.release(result.kujiEventId, result.ticketCount);
    void this.audit.record({
      actorType: 'USER',
      actorUserId: userId,
      action: 'ORDER_CANCEL',
      targetType: 'Order',
      targetId: orderId,
      ctx,
    });
    return this.serializeOrder(result);
  }

  private orderSelect() {
    return {
      id: true,
      userId: true,
      kujiEventId: true,
      ticketCount: true,
      unitPrice: true,
      totalAmount: true,
      status: true,
      idempotencyKey: true,
      shippingSnapshot: true,
      createdAt: true,
      updatedAt: true,
      paidAt: true,
      drawnAt: true,
      cancelledAt: true,
    } satisfies Prisma.OrderSelect;
  }

  private serializeOrder(o: Prisma.OrderGetPayload<{ select: ReturnType<OrderService['orderSelect']> }>) {
    return {
      id: o.id,
      kujiEventId: o.kujiEventId,
      ticketCount: o.ticketCount,
      unitPrice: o.unitPrice,
      totalAmount: o.totalAmount,
      status: o.status,
      shippingSnapshot: this.cipher.decryptJson(
        o.shippingSnapshot,
        FieldCipherService.aad('Order', 'shippingSnapshot'),
      ),
      createdAt: o.createdAt,
      paidAt: o.paidAt,
      drawnAt: o.drawnAt,
      cancelledAt: o.cancelledAt,
    };
  }

  private idempotencyCacheKey(userId: string, key: string) {
    return `idemp:orders:${userId}:${key}`;
  }

  private idempotencyLockKey(userId: string, key: string) {
    return `idemp:orders:lock:${userId}:${key}`;
  }
}

