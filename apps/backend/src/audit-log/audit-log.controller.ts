import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 사용자가 본인의 감사 로그만 조회. 관리자 전용 `/admin/audit-logs` 는 추후.
 * 필터는 최소한(action 만). 기본 50건, `limit` 으로 1..100.
 */
@Controller('me/audit-logs')
@UseGuards(JwtAuthGuard)
export class AuditLogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listMine(
    @CurrentUser() user: AuthUser,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Math.max(parseInt(limit ?? '50', 10) || 50, 1), 100);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        actorUserId: user.id,
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        ip: true,
        userAgent: true,
        metadata: true,
        createdAt: true,
      },
    });
    return rows;
  }
}
