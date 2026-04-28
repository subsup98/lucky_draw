import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AdminJwtService } from './admin-jwt.service';

export interface AdminAuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export type LoginStage = 'ENROLL_REQUIRED' | 'TOTP_REQUIRED';

interface ChallengePayload {
  adminId: string;
  stage: LoginStage;
  pendingSecret?: string; // ENROLL_REQUIRED 에서만 세팅
}

const FAIL_THRESHOLD = 5;
const LOCK_MINUTES = 15;
const CHALLENGE_TTL_SEC = 5 * 60;
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$invalidhashinvalidhashinvalidha';

@Injectable()
export class AdminAuthService {
  private readonly refreshTtlSec = Number(
    process.env.ADMIN_REFRESH_TTL_SECONDS ?? 60 * 60 * 24,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: AdminJwtService,
  ) {
    authenticator.options = { window: 1, step: 30 };
  }

  async login(params: { username: string; password: string }) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { username: params.username },
    });
    const fail = () => new UnauthorizedException('invalid credentials');

    if (!admin) {
      await argon2.verify(DUMMY_HASH, params.password).catch(() => null);
      throw fail();
    }
    if (!admin.isActive) throw fail();

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new HttpException(
        { message: 'account locked', lockedUntil: admin.lockedUntil },
        423,
      );
    }

    const ok = await argon2.verify(admin.passwordHash, params.password);
    if (!ok) {
      const nextCount = admin.failedLoginCount + 1;
      const lockedUntil =
        nextCount >= FAIL_THRESHOLD
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : admin.lockedUntil;
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          failedLoginCount: nextCount,
          lockedUntil: lockedUntil ?? null,
        },
      });
      throw fail();
    }

    // 비밀번호 OK. 실패 카운터 리셋은 2차 인증 성공 시점에 수행.
    if (!admin.totpSecret) {
      const pendingSecret = authenticator.generateSecret();
      const otpauthUrl = authenticator.keyuri(
        admin.username,
        process.env.TOTP_ISSUER ?? 'LuckyDraw Admin',
        pendingSecret,
      );
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
      const challengeToken = await this.writeChallenge({
        adminId: admin.id,
        stage: 'ENROLL_REQUIRED',
        pendingSecret,
      });
      return {
        stage: 'ENROLL_REQUIRED' as const,
        challengeToken,
        otpauthUrl,
        qrDataUrl,
      };
    }

    const challengeToken = await this.writeChallenge({
      adminId: admin.id,
      stage: 'TOTP_REQUIRED',
    });
    return { stage: 'TOTP_REQUIRED' as const, challengeToken };
  }

  async totpEnroll(params: { challengeToken: string; code: string }) {
    const payload = await this.consumeChallenge(params.challengeToken);
    if (!payload || payload.stage !== 'ENROLL_REQUIRED' || !payload.pendingSecret) {
      throw new UnauthorizedException('invalid challenge');
    }
    if (!authenticator.verify({ token: params.code, secret: payload.pendingSecret })) {
      // 다시 쓸 수 있도록 복구 저장(기한 유지 목적: 간단화 위해 신규 5분 TTL)
      await this.writeChallenge(payload, params.challengeToken);
      throw new UnauthorizedException('invalid totp');
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.adminId },
    });
    if (!admin || !admin.isActive) throw new UnauthorizedException('admin unavailable');
    if (admin.totpSecret) {
      throw new ConflictException('already enrolled');
    }

    const { plainCodes, hashes } = await this.generateBackupCodes(10);

    await this.prisma.$transaction([
      this.prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          totpSecret: payload.pendingSecret,
          totpEnrolledAt: new Date(),
          mfaEnabled: true,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      }),
      this.prisma.adminBackupCode.createMany({
        data: hashes.map((codeHash) => ({ adminUserId: admin.id, codeHash })),
      }),
    ]);

    const tokens = await this.issueTokens(admin.id, admin.tokenVersion);
    return { backupCodes: plainCodes, ...tokens };
  }

  async totpVerify(params: { challengeToken: string; code: string }) {
    const payload = await this.consumeChallenge(params.challengeToken);
    if (!payload || payload.stage !== 'TOTP_REQUIRED') {
      throw new UnauthorizedException('invalid challenge');
    }
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.adminId },
    });
    if (!admin || !admin.isActive || !admin.totpSecret) {
      throw new UnauthorizedException('admin unavailable');
    }
    if (!authenticator.verify({ token: params.code, secret: admin.totpSecret })) {
      // 실패 카운터는 비밀번호와 동일 정책 적용(2FA 실패도 잠금 대상).
      const nextCount = admin.failedLoginCount + 1;
      const lockedUntil =
        nextCount >= FAIL_THRESHOLD
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : admin.lockedUntil;
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { failedLoginCount: nextCount, lockedUntil: lockedUntil ?? null },
      });
      // challenge 살려두기: 잠기지 않은 동안엔 사용자가 즉시 재시도 / 백업코드 전환 가능.
      if (!lockedUntil) {
        await this.writeChallenge(payload, params.challengeToken);
      }
      throw new UnauthorizedException('invalid totp');
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    return this.issueTokens(admin.id, admin.tokenVersion);
  }

  async useBackupCode(params: { challengeToken: string; code: string }) {
    const payload = await this.consumeChallenge(params.challengeToken);
    if (!payload || payload.stage !== 'TOTP_REQUIRED') {
      throw new UnauthorizedException('invalid challenge');
    }
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.adminId },
      include: { backupCodes: { where: { usedAt: null } } },
    });
    if (!admin || !admin.isActive) throw new UnauthorizedException('admin unavailable');

    const normalized = params.code.replace(/[-\s]/g, '').toLowerCase();
    if (!normalized) throw new BadRequestException('invalid code');
    const candidateHash = this.hashBackupCode(normalized);

    let matchedId: string | null = null;
    for (const row of admin.backupCodes) {
      const a = Buffer.from(row.codeHash, 'hex');
      const b = Buffer.from(candidateHash, 'hex');
      if (a.length === b.length && timingSafeEqual(a, b)) {
        matchedId = row.id;
        break;
      }
    }
    if (!matchedId) {
      // challenge 살려두기: 백업코드 오타로 한 번 실패해도 즉시 재시도 가능.
      await this.writeChallenge(payload, params.challengeToken);
      throw new UnauthorizedException('invalid backup code');
    }

    await this.prisma.$transaction([
      this.prisma.adminBackupCode.update({
        where: { id: matchedId },
        data: { usedAt: new Date() },
      }),
      this.prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      }),
    ]);

    return this.issueTokens(admin.id, admin.tokenVersion);
  }

  async refresh(rawRefresh: string): Promise<AdminAuthTokens> {
    const parsed = this.parseRefresh(rawRefresh);
    if (!parsed) throw new UnauthorizedException('invalid refresh');
    const { adminId, tokenId, secret } = parsed;

    const key = this.refreshKey(adminId, tokenId);
    const stored = await this.redis.get(key);
    if (!stored) {
      await this.revokeAll(adminId);
      throw new UnauthorizedException('refresh reused');
    }
    if (stored !== this.hashSecret(secret)) {
      await this.revokeAll(adminId);
      throw new UnauthorizedException('refresh mismatch');
    }
    await this.redis.del(key);

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
    });
    if (!admin || !admin.isActive) throw new UnauthorizedException('admin unavailable');

    return this.issueTokens(admin.id, admin.tokenVersion);
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) return;
    const parsed = this.parseRefresh(rawRefresh);
    if (!parsed) return;
    await this.redis.del(this.refreshKey(parsed.adminId, parsed.tokenId));
  }

  // ---- internals ----

  private async issueTokens(adminId: string, tokenVersion: number): Promise<AdminAuthTokens> {
    const accessToken = await this.jwt.signAsync({ sub: adminId, tv: tokenVersion, aud: 'admin' });
    const tokenId = randomBytes(16).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const key = this.refreshKey(adminId, tokenId);
    await this.redis.set(key, this.hashSecret(secret), 'EX', this.refreshTtlSec);
    const refreshToken = `${adminId}.${tokenId}.${secret}`;
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlSec * 1000);
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  private parseRefresh(raw: string) {
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    const [adminId, tokenId, secret] = parts;
    if (!adminId || !tokenId || !secret) return null;
    return { adminId, tokenId, secret };
  }

  private hashSecret(secret: string) {
    return createHash('sha256').update(secret).digest('hex');
  }

  private refreshKey(adminId: string, tokenId: string) {
    return `admin:refresh:${adminId}:${tokenId}`;
  }

  private async revokeAll(adminId: string) {
    const pattern = `admin:refresh:${adminId}:*`;
    const stream = this.redis.scanStream({ match: pattern, count: 100 });
    const keys: string[] = [];
    for await (const batch of stream) keys.push(...(batch as string[]));
    if (keys.length) await this.redis.del(...keys);
    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  private async writeChallenge(payload: ChallengePayload, existingToken?: string) {
    const token = existingToken ?? randomBytes(24).toString('base64url');
    await this.redis.set(
      `admin:challenge:${token}`,
      JSON.stringify(payload),
      'EX',
      CHALLENGE_TTL_SEC,
    );
    return token;
  }

  private async consumeChallenge(token: string): Promise<ChallengePayload | null> {
    const key = `admin:challenge:${token}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    await this.redis.del(key);
    try {
      return JSON.parse(raw) as ChallengePayload;
    } catch {
      return null;
    }
  }

  private async generateBackupCodes(count: number) {
    const plainCodes: string[] = [];
    const hashes: string[] = [];
    for (let i = 0; i < count; i++) {
      const raw = randomBytes(6).toString('hex'); // 12 hex chars
      const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
      plainCodes.push(formatted);
      hashes.push(this.hashBackupCode(raw));
    }
    return { plainCodes, hashes };
  }

  private hashBackupCode(normalized: string) {
    // 백업 코드는 길고 고엔트로피이므로 argon2 대신 sha256 으로 충분.
    return createHash('sha256').update(normalized).digest('hex');
  }

  // 내부 조회: Guard/세션에서 사용.
  async findActiveAdmin(id: string) {
    return this.prisma.adminUser.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        tokenVersion: true,
        totpEnrolledAt: true,
      },
    });
  }

  resolveRole(role: AdminRole) {
    return role;
  }
}
