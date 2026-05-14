import { Injectable, Logger } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { FieldCipherService } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 회원 관리 서비스 — 관리자/자가 탈퇴 공통 로직 + 익명화.
 *
 * 정책:
 *   - 탈퇴 시점: `status='WITHDRAWN'`, `withdrawnAt=now`, `tokenVersion++` 로 모든 세션 즉시 무효화.
 *   - 30일 유예 거쳐 익명화: `withdrawnAt + 30days < now` 인 사용자 대상.
 *   - 익명화 내용: email → `withdrawn_<id>@anon.local`, name/phone → null,
 *     passwordHash → 사용 불가능한 랜덤(로그인 차단), `anonymizedAt=now`.
 *   - 주문/결제/배송/추첨 결과는 `userId` 외래키로 연결만 유지(전자상거래법 5년 보관).
 *   - 한 번 익명화된 계정은 다시 익명화하지 않음(`anonymizedAt IS NULL` 조건).
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  static readonly GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipherService,
  ) {}

  /** 사용자 자가 탈퇴 또는 관리자 강제 탈퇴 — 동일 동작. 멱등(이미 탈퇴면 그대로 반환). */
  async withdraw(userId: string): Promise<{ withdrawnAt: Date }> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.WITHDRAWN,
        withdrawnAt: new Date(),
        tokenVersion: { increment: 1 },
      },
      select: { withdrawnAt: true },
    });
    return { withdrawnAt: updated.withdrawnAt! };
  }

  /** 일시정지/복구. */
  async setStatus(userId: string, status: UserStatus): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status,
        // 정지/차단 시 즉시 세션 무효화
        ...(status === UserStatus.SUSPENDED || status === UserStatus.BANNED
          ? { tokenVersion: { increment: 1 } }
          : {}),
      },
    });
  }

  /** 관리자에 의한 비밀번호 리셋 — 임시 비번 생성 후 해시 저장, 평문 1회 반환. */
  async resetPassword(userId: string): Promise<{ tempPassword: string }> {
    const tempPassword = randomBytes(9).toString('base64url'); // 12자 정도
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    return { tempPassword };
  }

  /**
   * 30일 경과한 탈퇴 회원 익명화.
   * 1회 호출 = 배치 처리(최대 500명). cron 으로 매일 호출.
   */
  async anonymizeExpired(): Promise<{ processed: number; total: number }> {
    const cutoff = new Date(Date.now() - UserService.GRACE_PERIOD_MS);
    const candidates = await this.prisma.user.findMany({
      where: {
        status: UserStatus.WITHDRAWN,
        withdrawnAt: { lt: cutoff },
        anonymizedAt: null,
      },
      select: { id: true },
      take: 500,
    });
    let processed = 0;
    for (const { id } of candidates) {
      try {
        const sentinelHash = await argon2.hash(randomBytes(32).toString('hex'), {
          type: argon2.argon2id,
        });
        await this.prisma.user.update({
          where: { id },
          data: {
            email: `withdrawn_${id}@anon.local`,
            name: null,
            phone: null,
            passwordHash: sentinelHash,
            anonymizedAt: new Date(),
          },
        });
        processed += 1;
      } catch (err) {
        // P2002(email unique) 등은 한 명 실패해도 다른 처리 계속.
        this.logger.warn(`anonymize failed userId=${id} err=${String(err)}`);
      }
    }
    if (processed > 0) {
      this.logger.log(`anonymized ${processed}/${candidates.length} expired withdrawals`);
    }
    return { processed, total: candidates.length };
  }

  /** 관리자용 검색 + 페이지네이션. */
  async list(params: {
    search?: string;
    status?: UserStatus;
    limit: number;
    cursor?: string;
  }) {
    const where: Prisma.UserWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        status: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        withdrawnAt: true,
        anonymizedAt: true,
        _count: { select: { orders: true } },
      },
    });
    const hasNext = rows.length > params.limit;
    const items = hasNext ? rows.slice(0, params.limit) : rows;
    return {
      items: items.map((u) => ({
        ...u,
        phone: this.cipher.decrypt(u.phone, FieldCipherService.aad('User', 'phone')),
      })),
      nextCursor: hasNext ? items[items.length - 1]?.id ?? null : null,
      limit: params.limit,
    };
  }

  async findDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: { select: { orders: true, drawResults: true, inquiries: true } },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            ticketCount: true,
            totalAmount: true,
            status: true,
            createdAt: true,
            kujiEvent: { select: { title: true } },
          },
        },
      },
    });
    if (!user) return null;
    return {
      ...user,
      phone: this.cipher.decrypt(user.phone, FieldCipherService.aad('User', 'phone')),
    };
  }
}
