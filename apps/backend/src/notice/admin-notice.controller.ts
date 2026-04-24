import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { AdminAuthContext, AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { extractAuditCtx } from '../audit-log/audit-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';

@Controller('admin/notices')
@UseGuards(AdminJwtAuthGuard)
export class AdminNoticeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  async list(@Query('publishedOnly') publishedOnly?: string) {
    const where: Prisma.NoticeWhereInput = {};
    if (publishedOnly === 'true') where.publishedAt = { not: null };
    return this.prisma.notice.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        title: true,
        isPinned: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        authorId: true,
      },
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const notice = await this.prisma.notice.findUnique({ where: { id } });
    if (!notice) throw new NotFoundException('notice not found');
    return notice;
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() dto: CreateNoticeDto,
    @Req() req: Request,
  ) {
    const created = await this.prisma.notice.create({
      data: {
        title: dto.title,
        body: dto.body,
        isPinned: dto.isPinned ?? false,
        publishedAt: dto.publish ? new Date() : null,
        authorId: admin.id,
      },
    });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'NOTICE_CREATE',
      targetType: 'Notice',
      targetId: created.id,
      metadata: { title: created.title, published: !!created.publishedAt },
      ctx: extractAuditCtx(req),
    });
    return created;
  }

  @Patch(':id')
  async update(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateNoticeDto,
    @Req() req: Request,
  ) {
    const existing = await this.prisma.notice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('notice not found');

    const data: Prisma.NoticeUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.isPinned !== undefined) data.isPinned = dto.isPinned;
    if (dto.publish !== undefined) {
      data.publishedAt = dto.publish ? existing.publishedAt ?? new Date() : null;
    }

    const updated = await this.prisma.notice.update({ where: { id }, data });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'NOTICE_UPDATE',
      targetType: 'Notice',
      targetId: id,
      metadata: { changed: Object.keys(data) },
      ctx: extractAuditCtx(req),
    });
    return updated;
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const existing = await this.prisma.notice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('notice not found');
    await this.prisma.notice.delete({ where: { id } });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'NOTICE_DELETE',
      targetType: 'Notice',
      targetId: id,
      metadata: { title: existing.title },
      ctx: extractAuditCtx(req),
    });
  }
}
