import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit_options';

export interface RateLimitOptions {
  /** 식별자 prefix (엔드포인트 구분). 예: `auth:login` */
  key: string;
  /** 윈도우 내 허용 요청 수 */
  limit: number;
  /** 윈도우 길이(초) */
  windowSec: number;
  /** IP 외에 사용자 식별자(req.body.email 등)로 묶을 필드 경로. 있으면 "{ip}|{email}" 으로 키 생성 */
  bodyKeyField?: string;
}

export const RateLimit = (opts: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, opts);
