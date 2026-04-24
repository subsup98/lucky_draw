import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InquiryCategory, InquiryStatus, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { AdminAuthContext, AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { extractAuditCtx } from '../audit-log/audit-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnswerInquiryDto, UpdateInquiryStatusDto } from './dto/inquiry.dto';

@Controller('admin/inquiries')
@UseGuards(AdminJwtAuthGuard)
export class AdminInquiryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  async list(
    @Query('status') statusRaw?: string,
    @Query('category') categoryRaw?: string,
    @Query('userId') userId?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitRaw ?? '50', 10) || 50, 1), 200);
    const where: Prisma.InquiryWhereInput = {};
    if (statusRaw && (Object.values(InquiryStatus) as string[]).includes(statusRaw)) {
      where.status = statusRaw as InquiryStatus;
    }
    if (categoryRaw && (Object.values(InquiryCategory) as string[]).includes(categoryRaw)) {
      where.category = categoryRaw as InquiryCategory;
    }
    if (userId) where.userId = userId;

    const rows = await this.prisma.inquiry.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        orderId: true,
        category: true,
        subject: true,
        status: true,
        answeredAt: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
    });
    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    return {
      items,
      nextCursor: hasNext ? items[items.length - 1]?.id ?? null : null,
      limit,
    };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const inq = await this.prisma.inquiry.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true, phone: true } },
        answeredAdm: { select: { id: true, username: true } },
      },
    });
    if (!inq) throw new NotFoundException('inquiry not found');
    return inq;
  }

  @Patch(':id/answer')
  async answer(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Body() dto: AnswerInquiryDto,
    @Req() req: Request,
  ) {
    const existing = await this.prisma.inquiry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('inquiry not found');

    const updated = await this.prisma.inquiry.update({
      where: { id },
      data: {
        answer: dto.answer,
        answeredBy: admin.id,
        answeredAt: new Date(),
        status: dto.status ?? 'ANSWERED',
      },
    });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'INQUIRY_ANSWER',
      targetType: 'Inquiry',
      targetId: id,
      metadata: { previousStatus: existing.status, newStatus: updated.status },
      ctx: extractAuditCtx(req),
    });
    return updated;
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateInquiryStatusDto,
    @Req() req: Request,
  ) {
    const existing = await this.prisma.inquiry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('inquiry not found');
    const updated = await this.prisma.inquiry.update({
      where: { id },
      data: { status: dto.status },
    });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'INQUIRY_STATUS_UPDATE',
      targetType: 'Inquiry',
      targetId: id,
      metadata: { from: existing.status, to: dto.status },
      ctx: extractAuditCtx(req),
    });
    return updated;
  }
}
