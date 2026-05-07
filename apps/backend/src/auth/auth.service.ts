import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';

// TODO(auth 설계 §1): RS256 + 키 로테이션으로 전환
// TODO(auth 설계 §1): HIBP Pwned Passwords 대조
// TODO(auth 설계 §2): Device Fingerprint 바인딩, CSRF Double-Submit
// TODO(auth 설계 §2): 계정 잠금(10회/30분), 속도 제한
// TODO(auth 설계 §3~5): 이상 로그인 감지, Step-up, TOTP 2FA

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  // Redis key: refresh:{userId}:{tokenId} → hashedToken
  private readonly refreshTtlSeconds = Number(
    process.env.REFRESH_TTL_SECONDS ?? 60 * 60 * 24 * 14,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
  ) {}

  async signup(params: {
    email: string;
    password: string;
    name?: string;
    birthdate: string;
  }): Promise<{ userId: string }> {
    const email = params.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('email already registered');

    // 만 14세 이상 검증 — 정보통신망법 자격(만 14세 미만은 법정대리인 동의 필요).
    // YYYY-MM-DD 만 받으므로 정오(UTC) 기준으로 파싱하여 시간대 영향 최소화.
    const birth = new Date(params.birthdate + 'T12:00:00Z');
    if (Number.isNaN(birth.getTime())) {
      throw new BadRequestException('invalid birthdate');
    }
    const now = new Date();
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    const m = now.getUTCMonth() - birth.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
    if (age < 14) throw new BadRequestException('must be 14 or older');

    const passwordHash = await argon2.hash(params.password, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await this.prisma.user.create({
      data: { email, passwordHash, name: params.name, birthdate: birth },
      select: { id: true },
    });
    return { userId: user.id };
  }

  async login(params: { email: string; password: string }): Promise<AuthTokens & { userId: string }> {
    const email = params.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // 열거 방지: 사용자 부재/비밀번호 불일치/정지를 동일 메시지로 처리
    const fail = () => new UnauthorizedException('invalid credentials');
    if (!user) {
      // 사이드채널 방지 위한 더미 해시 검증
      await argon2.verify('$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$invalidhash', params.password).catch(() => null);
      throw fail();
    }
    if (user.status !== 'ACTIVE') throw fail();

    const ok = await argon2.verify(user.passwordHash, params.password);
    if (!ok) throw fail();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user.id, user.tokenVersion);
    return { userId: user.id, ...tokens };
  }

  async refresh(rawRefresh: string): Promise<AuthTokens> {
    const parsed = this.parseRefresh(rawRefresh);
    if (!parsed) throw new UnauthorizedException('invalid refresh');
    const { userId, tokenId, secret } = parsed;

    const key = this.refreshKey(userId, tokenId);
    const stored = await this.redis.get(key);
    if (!stored) {
      // Reuse Detection: 이미 rotation 되어 제거된 토큰을 다시 제시 → 해당 유저 전체 세션 무효화
      await this.revokeAll(userId);
      throw new UnauthorizedException('refresh reused');
    }

    const hash = this.hashSecret(secret);
    if (stored !== hash) {
      await this.revokeAll(userId);
      throw new UnauthorizedException('refresh mismatch');
    }

    // rotation: 기존 제거
    await this.redis.del(key);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('user unavailable');

    return this.issueTokens(user.id, user.tokenVersion);
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) return;
    const parsed = this.parseRefresh(rawRefresh);
    if (!parsed) return;
    await this.redis.del(this.refreshKey(parsed.userId, parsed.tokenId));
  }

  private async issueTokens(userId: string, tokenVersion: number): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync({
      sub: userId,
      tv: tokenVersion,
    });

    const tokenId = randomBytes(16).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const hash = this.hashSecret(secret);
    const key = this.refreshKey(userId, tokenId);
    await this.redis.set(key, hash, 'EX', this.refreshTtlSeconds);

    const refreshToken = `${userId}.${tokenId}.${secret}`;
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);
    return { accessToken, refreshToken, refreshTokenId: tokenId, refreshExpiresAt };
  }

  private parseRefresh(raw: string): { userId: string; tokenId: string; secret: string } | null {
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    const [userId, tokenId, secret] = parts;
    if (!userId || !tokenId || !secret) return null;
    return { userId, tokenId, secret };
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private refreshKey(userId: string, tokenId: string): string {
    return `refresh:${userId}:${tokenId}`;
  }

  private async revokeAll(userId: string): Promise<void> {
    const pattern = `refresh:${userId}:*`;
    const stream = this.redis.scanStream({ match: pattern, count: 100 });
    const keys: string[] = [];
    for await (const batch of stream) keys.push(...(batch as string[]));
    if (keys.length) await this.redis.del(...keys);
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  // ─── 이메일 6자리 코드 인증 (가입 + 비번 재설정) ─────────────────────────

  private static readonly CODE_TTL = 5 * 60; // 5분
  private static readonly RESEND_COOLDOWN = 30; // 30초 (재요청 가능 간격)
  private static readonly MAX_ATTEMPTS = 5;

  /** 6자리 0~9 숫자 코드. 암호학적 RNG 로 균일 분포. */
  private generate6DigitCode(): string {
    const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
    return n.toString().padStart(6, '0');
  }

  /** 만 14세 이상 검증. signup() 의 로직과 동일. */
  private assertAtLeast14(birthdate: string): Date {
    const birth = new Date(birthdate + 'T12:00:00Z');
    if (Number.isNaN(birth.getTime())) {
      throw new BadRequestException('invalid birthdate');
    }
    const now = new Date();
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    const m = now.getUTCMonth() - birth.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
    if (age < 14) throw new BadRequestException('must be 14 or older');
    return birth;
  }

  /**
   * 가입 인증 코드 요청.
   * - 비번은 미리 argon2 해시해서 Redis 에 저장(평문 보관 X).
   * - 60초 재발송 쿨다운, 5분 TTL.
   */
  async requestSignupCode(params: {
    email: string;
    password: string;
    name?: string;
    birthdate: string;
  }): Promise<void> {
    const email = params.email.toLowerCase();

    // 이미 가입된 이메일이면 코드 발송 없이 즉시 거부 (이메일 열거 가능 — 이메일 인증 흐름의 본질적 trade-off).
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('email already registered');

    this.assertAtLeast14(params.birthdate);

    const cooldownKey = `signup:cooldown:${email}`;
    if (await this.redis.get(cooldownKey)) {
      throw new BadRequestException('please wait before requesting another code');
    }

    const passwordHash = await argon2.hash(params.password, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 4,
    });

    const code = this.generate6DigitCode();
    const payload = JSON.stringify({
      code,
      passwordHash,
      name: params.name ?? null,
      birthdate: params.birthdate,
      attempts: 0,
    });
    await this.redis.set(`signup:code:${email}`, payload, 'EX', AuthService.CODE_TTL);
    await this.redis.set(cooldownKey, '1', 'EX', AuthService.RESEND_COOLDOWN);

    await this.email.sendCode(email, code, 'signup');
  }

  /**
   * 가입 인증 코드 검증 → 사용자 생성 + 토큰 발급.
   */
  async verifySignupCode(params: {
    email: string;
    code: string;
  }): Promise<AuthTokens & { userId: string }> {
    const email = params.email.toLowerCase();
    const key = `signup:code:${email}`;
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new BadRequestException('code expired or not requested');
    }
    const data = JSON.parse(raw) as {
      code: string;
      passwordHash: string;
      name: string | null;
      birthdate: string;
      attempts: number;
    };

    if (data.attempts >= AuthService.MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new BadRequestException('too many attempts');
    }
    if (data.code !== params.code) {
      data.attempts++;
      const ttl = await this.redis.ttl(key);
      await this.redis.set(
        key,
        JSON.stringify(data),
        'EX',
        ttl > 0 ? ttl : AuthService.CODE_TTL,
      );
      throw new BadRequestException('invalid code');
    }

    // 코드 일치 — 즉시 폐기 후 사용자 생성.
    await this.redis.del(key);

    // race: 코드 발송 후 같은 이메일로 누군가 가입 완료한 경우.
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('email already registered');

    const birth = new Date(data.birthdate + 'T12:00:00Z');
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: data.passwordHash,
        name: data.name ?? undefined,
        birthdate: birth,
        emailVerified: true,
      },
      select: { id: true, tokenVersion: true },
    });

    const tokens = await this.issueTokens(user.id, user.tokenVersion);
    return { userId: user.id, ...tokens };
  }

  /**
   * 비밀번호 재설정 코드 요청.
   * 사용자 존재 여부는 응답에 노출하지 않음 (열거 방지) — 존재하지 않아도 정상 응답.
   */
  async requestPasswordResetCode(params: { email: string }): Promise<void> {
    const email = params.email.toLowerCase();

    const cooldownKey = `pwreset:cooldown:${email}`;
    if (await this.redis.get(cooldownKey)) {
      // 쿨다운도 조용히 통과(타이밍 차이로 사용자 존재 추정 방지).
      return;
    }
    await this.redis.set(cooldownKey, '1', 'EX', AuthService.RESEND_COOLDOWN);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') return;

    const code = this.generate6DigitCode();
    const payload = JSON.stringify({ code, attempts: 0 });
    await this.redis.set(`pwreset:code:${email}`, payload, 'EX', AuthService.CODE_TTL);

    await this.email.sendCode(email, code, 'reset');
  }

  /**
   * 비밀번호 재설정 코드 검증 + 새 비밀번호 적용 + 모든 세션 무효화.
   */
  async resetPassword(params: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<void> {
    const email = params.email.toLowerCase();
    const key = `pwreset:code:${email}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new BadRequestException('code expired or not requested');
    const data = JSON.parse(raw) as { code: string; attempts: number };

    if (data.attempts >= AuthService.MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new BadRequestException('too many attempts');
    }
    if (data.code !== params.code) {
      data.attempts++;
      const ttl = await this.redis.ttl(key);
      await this.redis.set(
        key,
        JSON.stringify(data),
        'EX',
        ttl > 0 ? ttl : AuthService.CODE_TTL,
      );
      throw new BadRequestException('invalid code');
    }

    await this.redis.del(key);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') {
      throw new BadRequestException('user not found');
    }

    const passwordHash = await argon2.hash(params.newPassword, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 4,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // 모든 활성 세션 폐기 (다른 기기 로그인 차단).
    await this.revokeAll(user.id);

    // 재설정 성공 → 쿨다운 즉시 해제 (다시 변경하려면 곧바로 가능).
    await this.redis.del(`pwreset:cooldown:${email}`);
  }
}
