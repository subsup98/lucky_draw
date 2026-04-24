import type { Request } from 'express';
import type { AuditContext } from './audit-log.service';

/**
 * Express Request → AuditContext 추출.
 *
 * - IP: `X-Forwarded-For` 첫 주소(프록시 뒤) 우선, 없으면 `req.ip`.
 * - UA: User-Agent 헤더(없으면 null).
 * - 길이는 로그 팽창 방지를 위해 UA 는 512, IP 는 64자 내로 트림.
 */
export function extractAuditCtx(req: Request): AuditContext {
  const xff = req.headers['x-forwarded-for'];
  const forwarded =
    typeof xff === 'string'
      ? xff.split(',')[0]?.trim()
      : Array.isArray(xff)
      ? xff[0]
      : undefined;
  const ip = forwarded || req.ip || null;
  const uaHeader = req.headers['user-agent'];
  const ua = typeof uaHeader === 'string' ? uaHeader : null;
  return {
    ip: ip ? ip.slice(0, 64) : null,
    userAgent: ua ? ua.slice(0, 512) : null,
  };
}
