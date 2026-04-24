import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RedisService } from '../redis/redis.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

/**
 * 고정 윈도우 카운터 기반 속도 제한.
 *
 * - 키: `rl:{opts.key}:{ip}[|{bodyField}]:{windowBucket}` — `windowBucket = floor(now / windowSec)`.
 * - 카운트: `INCR` + 최초 1 일 때만 `EXPIRE windowSec` → 윈도우 경계에서 자연스럽게 리셋.
 * - Redis 장애 시 fail-open(Logger warn) — 가용성 > 엄격한 제한.
 * - 초과 시 429 + `Retry-After` 헤더.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!opts) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const ip = this.extractIp(req);
    const bodyKey =
      opts.bodyKeyField && this.pickField(req.body, opts.bodyKeyField);
    const suffix = bodyKey ? `${ip}|${String(bodyKey).slice(0, 64)}` : ip;
    const bucket = Math.floor(Date.now() / 1000 / opts.windowSec);
    const key = `rl:${opts.key}:${suffix}:${bucket}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, opts.windowSec);
      }
      if (count > opts.limit) {
        const ttl = await this.redis.ttl(key);
        const retry = ttl > 0 ? ttl : opts.windowSec;
        const res = ctx.switchToHttp().getResponse();
        res.setHeader?.('Retry-After', String(retry));
        throw new HttpException(
          { statusCode: 429, message: 'Too Many Requests', retryAfter: retry },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(`rate-limit redis error (fail-open): ${String(err)}`);
      return true;
    }
  }

  private extractIp(req: Request): string {
    const xff = req.headers['x-forwarded-for'];
    const forwarded =
      typeof xff === 'string'
        ? xff.split(',')[0]?.trim()
        : Array.isArray(xff)
        ? xff[0]
        : undefined;
    return (forwarded || req.ip || 'unknown').slice(0, 64);
  }

  private pickField(body: unknown, path: string): unknown {
    if (!body || typeof body !== 'object') return undefined;
    return (body as Record<string, unknown>)[path];
  }
}
