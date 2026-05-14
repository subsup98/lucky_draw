import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

/**
 * 개인정보 컬럼 단위 AES-256-GCM 암호화.
 *
 * 출력 포맷: `enc:v1:<base64(iv(12) || authTag(16) || ciphertext)>`
 *   - 접두어 `enc:v1:` 로 평문/구버전과 구분 → 백필 진행 중에도 양립 가능
 *   - v1 = AES-256-GCM, IV 12바이트(랜덤), tag 16바이트
 *   - 키 회전 시 v2, v3... 추가하고 `decrypt` 가 모든 버전 처리
 *
 * AAD (Additional Authenticated Data):
 *   - 모든 encrypt/decrypt 는 `${table}:${column}` 형태의 AAD 를 요구.
 *   - DB write 권한 보유자가 한 컬럼의 ct 를 다른 컬럼으로 복사하는 substitution 공격을 차단.
 *   - 동일 컬럼 내 row 간 swap 은 본 AAD 로는 방어 안 됨(현재 한계, 별도 이슈 트래킹).
 *
 * 키 관리:
 *   - 환경변수 `ENCRYPTION_KEY` = base64-encoded 32바이트 (256비트)
 *   - 운영 키 분실 = 모든 개인정보 복원 불가. 키 백업/순환 절차 별도 운영
 *   - 개발 환경(NODE_ENV !== 'production')에서 키 미설정 시 고정 dev 키 사용 — 운영 절대 금지
 *
 * Strict 모드:
 *   - `ENCRYPTION_STRICT=true` 면 `decrypt` 가 접두어 없는 평문을 받았을 때 throw.
 *   - 백필 완료 후 운영에서 활성화 → 누락된 write 경로를 즉시 감지.
 *   - 기본값 false (백필 진행 중 호환).
 */
@Injectable()
export class FieldCipherService implements OnModuleInit {
  private readonly logger = new Logger(FieldCipherService.name);
  private static readonly ALGO = 'aes-256-gcm';
  private static readonly IV_LEN = 12;
  private static readonly TAG_LEN = 16;
  private static readonly PREFIX_V1 = 'enc:v1:';
  // 32바이트 base64. dev 전용 — 운영에서는 ENCRYPTION_KEY 강제.
  private static readonly DEV_FALLBACK_KEY_B64 =
    'ZGV2ZGV2ZGV2ZGV2ZGV2ZGV2ZGV2ZGV2ZGV2ZGV2ZGU=';

  private key!: Buffer;
  private strict = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('ENCRYPTION_KEY');
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    this.strict = this.config.get<string>('ENCRYPTION_STRICT') === 'true';
    if (!raw) {
      if (isProd) {
        throw new Error(
          'ENCRYPTION_KEY missing — refusing to start in production with default dev key',
        );
      }
      this.logger.warn(
        'ENCRYPTION_KEY not set — using DEV fallback. NEVER deploy this to production.',
      );
      const dev = Buffer.from(FieldCipherService.DEV_FALLBACK_KEY_B64, 'base64');
      if (dev.length !== 32) {
        throw new Error(
          `DEV fallback key decoded to ${dev.length} bytes (expected 32) — fix DEV_FALLBACK_KEY_B64`,
        );
      }
      this.key = dev;
      return;
    }
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length}). Generate via: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
      );
    }
    this.key = buf;
  }

  /** `${table}:${column}` AAD 빌더 — 호출부 가독성용. */
  static aad(table: string, column: string): Buffer {
    if (!table || !column) {
      throw new Error('aad requires non-empty table and column');
    }
    return Buffer.from(`${table}:${column}`, 'utf8');
  }

  /** 평문을 암호문으로. null/undefined 는 null 그대로 반환. AAD 는 필수. */
  encrypt(plain: string | null | undefined, aad: Buffer): string | null {
    if (plain === null || plain === undefined) return null;
    if (plain === '') return '';
    const iv = randomBytes(FieldCipherService.IV_LEN);
    const cipher = createCipheriv(FieldCipherService.ALGO, this.key, iv);
    cipher.setAAD(aad);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([iv, tag, ct]);
    return FieldCipherService.PREFIX_V1 + blob.toString('base64');
  }

  /**
   * 암호문을 평문으로. AAD 는 암호화 시점과 동일해야 함.
   * 접두어 없으면: strict=true → throw, false → 평문 그대로 반환(백필 호환).
   * 접두어 있는데 복호화/AAD 검증 실패 시 throw.
   */
  decrypt(value: string | null | undefined, aad: Buffer): string | null {
    if (value === null || value === undefined) return null;
    if (value === '') return '';
    if (!value.startsWith(FieldCipherService.PREFIX_V1)) {
      if (this.strict) {
        throw new Error(
          `decrypt: plaintext value seen with strict mode on (aad=${aad.toString('utf8')})`,
        );
      }
      return value;
    }
    const blob = Buffer.from(
      value.slice(FieldCipherService.PREFIX_V1.length),
      'base64',
    );
    const iv = blob.subarray(0, FieldCipherService.IV_LEN);
    const tag = blob.subarray(
      FieldCipherService.IV_LEN,
      FieldCipherService.IV_LEN + FieldCipherService.TAG_LEN,
    );
    const ct = blob.subarray(FieldCipherService.IV_LEN + FieldCipherService.TAG_LEN);
    const decipher = createDecipheriv(FieldCipherService.ALGO, this.key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  }

  /** JSON 객체 → 단일 문자열 암호화. DB 컬럼이 Json 타입인 경우 `{ enc: "..." }` 형태로 저장. */
  encryptJson(value: unknown, aad: Buffer): { enc: string } | null {
    if (value === null || value === undefined) return null;
    const enc = this.encrypt(JSON.stringify(value), aad);
    return enc === null ? null : { enc };
  }

  /** `{ enc: "..." }` 또는 평문 객체(백필 전)를 모두 받아 평문 객체 반환. */
  decryptJson<T = unknown>(value: unknown, aad: Buffer): T | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object' && value !== null && 'enc' in value) {
      const enc = (value as { enc: unknown }).enc;
      if (typeof enc !== 'string') return null;
      const plain = this.decrypt(enc, aad);
      if (plain === null) return null;
      return JSON.parse(plain) as T;
    }
    if (this.strict) {
      throw new Error(
        `decryptJson: plaintext object seen with strict mode on (aad=${aad.toString('utf8')})`,
      );
    }
    return value as T;
  }

  /** 이미 암호화된 값인지 확인. 멱등 암호화에 사용. */
  isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(FieldCipherService.PREFIX_V1);
  }
}
