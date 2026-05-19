import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const RESERVE_TTL_MS = 5 * 60 * 1000; // 5분
const MAX_RESERVE_PER_REQUEST = 5;

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 쿠지의 전체 positions 그리드.
   * - AVAILABLE / RESERVED: status 만 노출 (등수 비공개)
   * - SOLD: rank/tierName 까지 노출 (이미 결정된 결과)
   * - viewerUserId 가 reserve 한 자리는 별도 표시 (mine=true)
   */
  async listGrid(kujiEventId: string, viewerUserId?: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { kujiEventId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        position: true,
        status: true,
        reservedByUserId: true,
        reserveExpiresAt: true,
        prizeTier: { select: { rank: true, name: true, isLastPrize: true } },
      },
    });

    const now = Date.now();
    return tickets.map((t) => {
      // RESERVED 인데 만료된 경우 — 클라이언트엔 AVAILABLE 로 보여도 OK (cron 이 곧 정리)
      const expired =
        t.status === 'RESERVED' &&
        t.reserveExpiresAt &&
        t.reserveExpiresAt.getTime() < now;
      const effectiveStatus = expired ? 'AVAILABLE' : t.status;
      const mine =
        !expired && t.reservedByUserId && t.reservedByUserId === viewerUserId;
      return {
        id: t.id,
        position: t.position,
        status: effectiveStatus,
        mine: !!mine,
        // SOLD 만 등수 공개
        rank: effectiveStatus === 'SOLD' ? t.prizeTier.rank : null,
        tierName: effectiveStatus === 'SOLD' ? t.prizeTier.name : null,
        isLastPrize:
          effectiveStatus === 'SOLD' ? t.prizeTier.isLastPrize : false,
        reserveExpiresAt: mine ? t.reserveExpiresAt : null,
      };
    });
  }

  /**
   * positions 일괄 reserve.
   * - 트랜잭션 + advisory lock 패턴 (FOR UPDATE) 으로 동시성 차단
   * - 일부 실패 시 전체 롤백
   * - 만료된 RESERVED 는 재점유 허용
   */
  async reserve(
    kujiEventId: string,
    positions: number[],
    userId: string,
  ) {
    if (!positions.length) {
      throw new BadRequestException('positions empty');
    }
    if (positions.length > MAX_RESERVE_PER_REQUEST) {
      throw new BadRequestException(
        `max ${MAX_RESERVE_PER_REQUEST} positions per request`,
      );
    }
    if (new Set(positions).size !== positions.length) {
      throw new BadRequestException('duplicate positions');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESERVE_TTL_MS);

    return this.prisma.$transaction(
      async (tx) => {
        // 내가 같은 쿠지에서 이미 점유 중인 자리 — 새 요청과 합산해 max 체크
        const myExisting = await tx.ticket.count({
          where: {
            kujiEventId,
            status: 'RESERVED',
            reservedByUserId: userId,
            reserveExpiresAt: { gt: now },
          },
        });
        if (myExisting + positions.length > MAX_RESERVE_PER_REQUEST) {
          throw new ConflictException(
            `이미 ${myExisting}자리 점유 중. 합 ${MAX_RESERVE_PER_REQUEST} 초과`,
          );
        }

        // FOR UPDATE 로 대상 행 락
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            position: number;
            status: TicketStatus;
            reservedByUserId: string | null;
            reserveExpiresAt: Date | null;
          }>
        >`
          SELECT "id","position","status","reservedByUserId","reserveExpiresAt"
            FROM "Ticket"
           WHERE "kujiEventId" = ${kujiEventId}
             AND "position" IN (${Prisma.join(positions)})
           FOR UPDATE
        `;
        if (rows.length !== positions.length) {
          throw new NotFoundException('일부 자리가 존재하지 않습니다');
        }

        for (const r of rows) {
          if (r.status === 'SOLD') {
            throw new ConflictException(
              `${r.position}번 자리는 이미 판매 완료`,
            );
          }
          if (r.status === 'RESERVED') {
            const stillValid =
              r.reserveExpiresAt && r.reserveExpiresAt > now;
            const isMine = r.reservedByUserId === userId;
            if (stillValid && !isMine) {
              throw new ConflictException(
                `${r.position}번 자리는 다른 사용자가 선택 중`,
              );
            }
          }
        }

        await tx.ticket.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: {
            status: 'RESERVED',
            reservedByUserId: userId,
            reservedAt: now,
            reserveExpiresAt: expiresAt,
          },
        });

        return {
          ticketIds: rows.map((r) => r.id),
          positions: rows.map((r) => r.position).sort((a, b) => a - b),
          reserveExpiresAt: expiresAt,
        };
      },
      { timeout: 10000 },
    );
  }

  /** 사용자가 명시적으로 자기 점유 자리 해제. orderId 가 걸린 자리는 제외. */
  async releaseMine(kujiEventId: string, userId: string) {
    const result = await this.prisma.ticket.updateMany({
      where: {
        kujiEventId,
        status: 'RESERVED',
        reservedByUserId: userId,
        orderId: null,
      },
      data: {
        status: 'AVAILABLE',
        reservedByUserId: null,
        reservedAt: null,
        reserveExpiresAt: null,
      },
    });
    return { released: result.count };
  }

  /** 만료된 RESERVED → AVAILABLE. cron 1분 주기 호출. */
  async releaseExpired(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.ticket.updateMany({
      where: {
        status: 'RESERVED',
        orderId: null,
        reserveExpiresAt: { lt: now },
      },
      data: {
        status: 'AVAILABLE',
        reservedByUserId: null,
        reservedAt: null,
        reserveExpiresAt: null,
      },
    });
    if (result.count > 0) {
      this.logger.log(`releaseExpired: ${result.count} ticket(s) returned`);
    }
    return result.count;
  }

  /**
   * 쿠지 1회 셔플 시드 — totalTickets 만큼의 Ticket 행 생성 + tier 분포로 셔플 할당.
   * - 사전 조건: 기존 Ticket 행 0개 (재셔플은 별도 함수)
   * - PrizeTier.totalQuantity 합 == KujiEvent.totalTickets 검증
   */
  async seedForKuji(kujiEventId: string) {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.kujiEvent.findUnique({
        where: { id: kujiEventId },
        select: {
          totalTickets: true,
          prizeTiers: {
            include: { prizeItems: { select: { id: true } } },
          },
        },
      });
      if (!event) throw new NotFoundException('kuji not found');

      const existing = await tx.ticket.count({ where: { kujiEventId } });
      if (existing > 0) {
        throw new ConflictException(
          `이미 ${existing}개 Ticket 존재 — 재셔플은 별도 API`,
        );
      }

      const tierSum = event.prizeTiers.reduce(
        (s, t) => s + t.totalQuantity,
        0,
      );
      if (tierSum !== event.totalTickets) {
        throw new BadRequestException(
          `tier 총합 ${tierSum} != totalTickets ${event.totalTickets}`,
        );
      }

      // tier/item 분배 배열 생성: 각 자리에 (tierId, itemId?) 할당
      const slots: Array<{ tierId: string; itemId: string | null }> = [];
      for (const t of event.prizeTiers) {
        for (let i = 0; i < t.totalQuantity; i++) {
          // tier 안에 PrizeItem 이 여러 개면 라운드로빈
          const item =
            t.prizeItems.length > 0
              ? t.prizeItems[i % t.prizeItems.length]!
              : null;
          slots.push({
            tierId: t.id,
            itemId: item?.id ?? null,
          });
        }
      }

      // Fisher-Yates 셔플 (crypto 시드)
      this.shuffleInPlace(slots);

      // 일괄 insert
      const now = new Date();
      const rows = slots.map((s, idx) => ({
        kujiEventId,
        position: idx + 1,
        prizeTierId: s.tierId,
        prizeItemId: s.itemId,
        status: TicketStatus.AVAILABLE,
        createdAt: now,
        updatedAt: now,
      }));
      await tx.ticket.createMany({ data: rows });
      this.logger.log(`seedForKuji: ${rows.length} tickets created for ${kujiEventId}`);
      return { created: rows.length };
    });
  }

  private shuffleInPlace<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      // crypto-based fair random
      const buf = randomBytes(4);
      const r = buf.readUInt32BE(0) / 0x100000000;
      const j = Math.floor(r * (i + 1));
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
  }
}
