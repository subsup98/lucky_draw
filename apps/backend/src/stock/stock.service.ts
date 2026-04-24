import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * 재고 1차 카운터(Redis).
 *
 * - 목적: 오픈런 스파이크에서 `KujiEvent.soldTickets` UPDATE 경합을 Redis 카운터로 선-차단해
 *   DB 부하·롤백을 줄인다. DB CAS(`UPDATE ... WHERE soldTickets + N <= totalTickets`)는 여전히
 *   source of truth 이므로 Redis 가 누락되거나 오차가 생겨도 정합성은 깨지지 않는다.
 * - 키 공간: `kuji:stock:{kujiEventId}` — TTL 없음. 값은 "잔여 티켓 수".
 * - 초기화: 키가 없으면 DB 의 `totalTickets - soldTickets` 로 lazy-init (`SET NX`).
 * - 원자성: reserve 는 Lua 스크립트로 GET → 체크 → DECRBY 를 한 번에. 초기화 실패 시 Redis 게이트를
 *   skip(통과 허용) 하고 DB CAS 에 위임 — Redis 장애로 서비스가 멈추지 않도록 한다.
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  // KEYS[1] = kuji:stock:{id}, ARGV[1] = reserveCount
  // return: 남은 수량 / -1 = 재고 부족 / -2 = 키 미초기화
  private static readonly RESERVE_SCRIPT = `
local v = redis.call('GET', KEYS[1])
if not v then
  return -2
end
local need = tonumber(ARGV[1])
local cur = tonumber(v)
if cur - need < 0 then
  return -1
end
redis.call('DECRBY', KEYS[1], need)
return cur - need
`;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 티켓 n장 예약. 성공 시 Redis 카운터를 차감. 실패/예외 경로에서 반드시 release.
   * Redis 장애로 reserve 가 예외를 던지면 false 로 처리하지 않고 상위에 전파 — 단, 여기선
   * try/catch 로 "통과"시키는 방어적 선택을 함(DB CAS 가 최종 방어선이므로).
   */
  async reserve(
    kujiEventId: string,
    count: number,
  ): Promise<
    | { ok: true; remaining: number; gated: true }
    | { ok: true; remaining: null; gated: false } // Redis skip — DB에 위임
    | { ok: false; reason: 'out_of_stock' | 'not_found' }
  > {
    const key = this.stockKey(kujiEventId);
    try {
      let result = (await this.redis.eval(
        StockService.RESERVE_SCRIPT,
        1,
        key,
        String(count),
      )) as number;

      if (result === -2) {
        // lazy-init
        const ev = await this.prisma.kujiEvent.findUnique({
          where: { id: kujiEventId },
          select: { totalTickets: true, soldTickets: true },
        });
        if (!ev) return { ok: false, reason: 'not_found' };
        const initial = Math.max(ev.totalTickets - ev.soldTickets, 0);
        await this.redis.set(key, String(initial), 'NX');
        result = (await this.redis.eval(
          StockService.RESERVE_SCRIPT,
          1,
          key,
          String(count),
        )) as number;
      }

      if (result === -1) return { ok: false, reason: 'out_of_stock' };
      if (result === -2) {
        // 여전히 초기화 실패(경쟁적 DEL 등) — 게이트 skip
        this.logger.warn(`stock gate skipped (init failed) kuji=${kujiEventId}`);
        return { ok: true, remaining: null, gated: false };
      }
      return { ok: true, remaining: result, gated: true };
    } catch (err) {
      // Redis 장애 — DB CAS 에 위임
      this.logger.warn(`stock reserve redis error, skipping gate: ${String(err)}`);
      return { ok: true, remaining: null, gated: false };
    }
  }

  /** 예약 복구 — 주문 실패/취소 시. 오차 허용: 실패해도 상위 플로우에 영향 없음. */
  async release(kujiEventId: string, count: number): Promise<void> {
    try {
      await this.redis.incrby(this.stockKey(kujiEventId), count);
    } catch (err) {
      this.logger.warn(
        `stock release redis error kuji=${kujiEventId} n=${count}: ${String(err)}`,
      );
    }
  }

  private stockKey(id: string): string {
    return `kuji:stock:${id}`;
  }
}
