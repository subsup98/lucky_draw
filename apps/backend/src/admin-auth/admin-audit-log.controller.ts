import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * 관리자 감사 로그 조회 — 운영 중 조사용.
 * 필터: actorType / actorUserId / adminUserId / action / targetType / targetId / from / to
 * 페이지네이션: limit + cursor(createdAt|id) — 최신순 탐색.
 */
@Controller('admin/audit-logs')
@UseGuards(AdminJwtAuthGuard)
export class AdminAuditLogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('actorType') actorType?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('adminUserId') adminUserId?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = Math.min(
      Math.max(parseInt(limitRaw ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const where: Prisma.AuditLogWhereInput = {};
    if (actorType && (['ADMIN', 'SYSTEM', 'USER'] as const).includes(actorType as AuditActorType)) {
      where.actorType = actorType as AuditActorType;
    }
    if (actorUserId) where.actorUserId = actorUserId;
    if (adminUserId) where.adminUserId = adminUserId;
    if (action) where.action = action;
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
      if (to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(to);
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        actorType: true,
        actorUserId: true,
        adminUserId: true,
        action: true,
        targetType: true,
        targetId: true,
        ip: true,
        userAgent: true,
        metadata: true,
        createdAt: true,
      },
    });

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? items[items.length - 1]?.id : null;

    return { items, nextCursor, limit };
  }
}
