import { Controller, Get, HttpCode, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { extractAuditCtx } from '../audit-log/audit-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from './user.service';

/**
 * 사용자 자가 탈퇴.
 * 즉시 status=WITHDRAWN + 30일 후 자동 익명화 예약.
 * 주문 진행 중 등 추가 조건은 정책 결정 후 추가 가능.
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeUserController {
  constructor(
    private readonly users: UserService,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  /** 현재 로그인한 사용자 프로필. */
  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        birthdate: true,
        createdAt: true,
      },
    });
    if (!u) throw new NotFoundException('user not found');
    return u;
  }

  @Post('withdraw')
  @HttpCode(200)
  async withdraw(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const result = await this.users.withdraw(user.id);
    await this.audit.record({
      actorType: 'USER',
      actorUserId: user.id,
      action: 'USER_WITHDRAW',
      targetType: 'User',
      targetId: user.id,
      metadata: {
        self: true,
        withdrawnAt: result.withdrawnAt.toISOString(),
        anonymizeScheduledAt: new Date(
          result.withdrawnAt.getTime() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      ctx: extractAuditCtx(req),
    });
    return result;
  }
}
