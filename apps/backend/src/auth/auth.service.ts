import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

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
  ) {}

  async signup(params: { email: string; password: string; name?: string }): Promise<{ userId: string }> {
    const email = params.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('email already registered');

    const passwordHash = await argon2.hash(params.password, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await this.prisma.user.create({
      data: { email, passwordHash, name: params.name },
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
}
