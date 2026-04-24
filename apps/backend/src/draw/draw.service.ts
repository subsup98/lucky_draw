import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuditLogService, type AuditContext } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShipmentService } from '../shipment/shipment.service';

interface TierRow {
  inventoryId: string;
  prizeTierId: string;
  rank: string;
  name: string;
  isLastPrize: boolean;
  animationPreset: string | null;
  remaining: number;
  version: number;
}

const CAS_MAX_RETRIES = 5;

@Injectable()
export class DrawService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipment: ShipmentService,
    private readonly audit: AuditLogService,
  ) {}

  async execute(userId: string, orderId: string, ctx?: AuditContext) {
    const order = await this.prisma.order.findUnique({
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

    // 멱등: 이미 DRAWN 이면 기존 결과 반환
    if (order.status === 'DRAWN') {
      return this.loadResults(orderId);
    }
    if (order.status !== 'PAID') {
      throw new ConflictException(`order not drawable: ${order.status}`);
    }

    // 추첨 실행 — Inventory.version CAS + DrawResult insert + Order 전이 를 단일 트랜잭션으로.
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Order 락 (동시 draw 호출 방어)
        const [locked] = await tx.$queryRaw<
          Array<{
            status: string;
            ticketCount: number;
            kujiEventId: string;
            shippingSnapshot: unknown;
          }>
        >`
          SELECT "status", "ticketCount", "kujiEventId", "shippingSnapshot" FROM "Order"
           WHERE "id" = ${orderId} FOR UPDATE
        `;
        if (!locked) throw new NotFoundException('order not found');
        if (locked.status === 'DRAWN') {
          // 이미 내부에서 처리됨
          return this.loadResults(orderId, tx);
        }
        if (locked.status !== 'PAID') {
          throw new ConflictException(`order not drawable: ${locked.status}`);
        }

        const drawn: Array<{
          ticketIndex: number;
          tierId: string;
          tierRank: string;
          tierName: string;
          isLastPrize: boolean;
          animationPreset: string | null;
          prizeItemId: string | null;
        }> = [];

        // 라스트원상 자격 판정 — 이벤트 완매 + 이 주문이 해당 이벤트의 최신 PAID/DRAWN 주문.
        const isLastOrder = await this.isLastPrizeOrder(
          tx,
          locked.kujiEventId,
          orderId,
        );

        for (let i = 1; i <= locked.ticketCount; i++) {
          // 라스트원상은 "마지막 주문의 마지막 티켓" 에게만 자동 배정.
          const awardLastPrize = isLastOrder && i === locked.ticketCount;
          const chosen = await this.drawOneWithCAS(
            tx,
            locked.kujiEventId,
            orderId,
            userId,
            i,
            awardLastPrize,
          );
          drawn.push(chosen);
        }

        // Order PAID → DRAWN 원자 전이
        const updated = await tx.$executeRaw`
          UPDATE "Order"
             SET "status"='DRAWN', "drawnAt"=${new Date()}, "updatedAt"=${new Date()}
           WHERE "id"=${orderId} AND "status"='PAID'
        `;
        if (updated === 0) {
          throw new ConflictException('order state changed concurrently');
        }

        // DRAWN 전이 직후 Shipment 자동 생성 (orderId UNIQUE 로 중복 차단)
        await this.shipment.createForOrderInTx(
          tx,
          orderId,
          locked.shippingSnapshot,
        );

        return {
          orderId,
          ticketCount: drawn.length,
          results: drawn,
        };
      },
      { timeout: 15000, isolationLevel: 'ReadCommitted' },
    );
    void this.audit.record({
      actorType: 'USER',
      actorUserId: userId,
      action: 'DRAW_EXECUTE',
      targetType: 'Order',
      targetId: orderId,
      ctx,
      metadata: {
        ticketCount: result.ticketCount,
        tiers: result.results.map((r) => ({
          ticketIndex: r.ticketIndex,
          tierRank: r.tierRank,
          isLastPrize: r.isLastPrize,
        })),
      },
    });
    return result;
  }

  async findByOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true, status: true },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new ForbiddenException();
    return this.loadResults(orderId);
  }

  /**
   * 라스트원상 자격: (1) 이벤트 완매(`soldTickets == totalTickets`) AND
   *                (2) 이 주문이 해당 이벤트의 최신 PAID/DRAWN 주문(createdAt 기준).
   *
   * 판정은 Draw 트랜잭션 내부에서 하므로 일관된 스냅샷으로 본다.
   */
  private async isLastPrizeOrder(
    tx: Prisma.TransactionClient,
    kujiEventId: string,
    orderId: string,
  ): Promise<boolean> {
    const ev = await tx.kujiEvent.findUnique({
      where: { id: kujiEventId },
      select: { totalTickets: true, soldTickets: true },
    });
    if (!ev || ev.soldTickets !== ev.totalTickets) return false;
    const latest = await tx.order.findFirst({
      where: { kujiEventId, status: { in: ['PAID', 'DRAWN'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return latest?.id === orderId;
  }

  // -----------------------------------------------------------------------
  // 1티켓 추첨: 가중 랜덤으로 티어 선택 → CAS 차감 → DrawResult 삽입.
  // CAS 실패(version 경합) 시 재고 재조회 후 재시도.
  // `awardLastPrize=true` 면 일반 가중 추첨을 skip 하고 `isLastPrize=true` 티어를 강제 배정.
  // 일반 추첨에서는 `isLastPrize=true` 티어를 후보에서 제외해야 한다(일반 당첨으로 라스트상이 소비되면 안 됨).
  // -----------------------------------------------------------------------
  private async drawOneWithCAS(
    tx: Prisma.TransactionClient,
    kujiEventId: string,
    orderId: string,
    userId: string,
    ticketIndex: number,
    awardLastPrize = false,
  ) {
    for (let attempt = 0; attempt < CAS_MAX_RETRIES; attempt++) {
      const tiers = await tx.$queryRaw<TierRow[]>`
        SELECT i."id"            AS "inventoryId",
               pt."id"           AS "prizeTierId",
               pt."rank"         AS "rank",
               pt."name"         AS "name",
               pt."isLastPrize"  AS "isLastPrize",
               pt."animationPreset" AS "animationPreset",
               i."remainingQuantity" AS "remaining",
               i."version"       AS "version"
          FROM "PrizeTier" pt
          JOIN "Inventory" i ON i."prizeTierId" = pt."id"
         WHERE pt."kujiEventId" = ${kujiEventId}
           AND i."remainingQuantity" > 0
           AND pt."isLastPrize" = ${awardLastPrize}
      `;
      if (tiers.length === 0) {
        throw new ConflictException(
          awardLastPrize ? 'last prize unavailable' : 'all tiers sold out',
        );
      }

      // 가중치 = remainingQuantity
      const seed = randomBytes(16).toString('hex');
      const totalWeight = tiers.reduce((s, t) => s + t.remaining, 0);
      const rand = this.seededRandom(seed);
      let pick = Math.floor(rand * totalWeight);
      let chosenTier: TierRow | null = null;
      for (const t of tiers) {
        if (pick < t.remaining) {
          chosenTier = t;
          break;
        }
        pick -= t.remaining;
      }
      if (!chosenTier) chosenTier = tiers[tiers.length - 1]!;

      // CAS: version 일치할 때만 차감
      const affected = await tx.$executeRaw`
        UPDATE "Inventory"
           SET "remainingQuantity" = "remainingQuantity" - 1,
               "version" = "version" + 1,
               "updatedAt" = ${new Date()}
         WHERE "id" = ${chosenTier.inventoryId}
           AND "version" = ${chosenTier.version}
           AND "remainingQuantity" > 0
      `;
      if (affected === 0) {
        continue; // 경합 → 재시도
      }

      // 대표 PrizeItem 1개(있으면) 연결
      const item = await tx.prizeItem.findFirst({
        where: { prizeTierId: chosenTier.prizeTierId },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });

      const snapshot: Prisma.InputJsonValue = {
        tiers: tiers.map((t) => ({
          tierId: t.prizeTierId,
          rank: t.rank,
          remainingBefore: t.remaining,
          version: t.version,
        })),
        chosen: {
          tierId: chosenTier.prizeTierId,
          rank: chosenTier.rank,
        },
        totalWeight,
        algorithm: awardLastPrize ? 'last-prize-v1' : 'weighted-remaining-v1',
        lastPrize: awardLastPrize,
      };

      await tx.drawResult.create({
        data: {
          orderId,
          userId,
          kujiEventId,
          ticketIndex,
          prizeTierId: chosenTier.prizeTierId,
          prizeItemId: item?.id ?? null,
          seed,
          snapshot,
        },
      });

      return {
        ticketIndex,
        tierId: chosenTier.prizeTierId,
        tierRank: chosenTier.rank,
        tierName: chosenTier.name,
        isLastPrize: chosenTier.isLastPrize,
        animationPreset: chosenTier.animationPreset ?? null,
        prizeItemId: item?.id ?? null,
      };
    }
    throw new InternalServerErrorException(
      `inventory CAS contention (>${CAS_MAX_RETRIES} retries)`,
    );
  }

  private async loadResults(
    orderId: string,
    client?: Prisma.TransactionClient,
  ) {
    const c = client ?? this.prisma;
    const rows = await c.drawResult.findMany({
      where: { orderId },
      orderBy: { ticketIndex: 'asc' },
      include: {
        prizeTier: {
          select: { id: true, rank: true, name: true, isLastPrize: true, animationPreset: true },
        },
        prizeItem: { select: { id: true, name: true, imageUrl: true } },
      },
    });
    return {
      orderId,
      ticketCount: rows.length,
      results: rows.map((r) => ({
        ticketIndex: r.ticketIndex,
        tierId: r.prizeTier.id,
        tierRank: r.prizeTier.rank,
        tierName: r.prizeTier.name,
        isLastPrize: r.prizeTier.isLastPrize,
        animationPreset: r.prizeTier.animationPreset ?? null,
        prizeItemId: r.prizeItem?.id ?? null,
        prizeItemName: r.prizeItem?.name ?? null,
        drawnAt: r.drawnAt,
      })),
    };
  }

  /**
   * Seed(hex string) → [0,1) 실수.
   * 재현성이 핵심이라 Math.random 대신 seed의 상위 53비트를 float으로 매핑.
   */
  private seededRandom(seed: string): number {
    // 상위 48비트(12 hex chars)를 Number.MAX_SAFE_INTEGER 이내로 정규화
    const hi = Number(BigInt('0x' + seed.slice(0, 12)));
    return hi / 0x1000000000000; // 2^48
  }
}
