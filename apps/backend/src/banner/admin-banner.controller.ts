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
import { BannerPlacement, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { AdminAuthContext, AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { extractAuditCtx } from '../audit-log/audit-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';

@Controller('admin/banners')
@UseGuards(AdminJwtAuthGuard)
export class AdminBannerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  async list(@Query('placement') placementRaw?: string) {
    const where: Prisma.BannerWhereInput = {};
    if (placementRaw && (Object.values(BannerPlacement) as string[]).includes(placementRaw)) {
      where.placement = placementRaw as BannerPlacement;
    }
    return this.prisma.banner.findMany({
      where,
      orderBy: [{ placement: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() dto: CreateBannerDto,
    @Req() req: Request,
  ) {
    const created = await this.prisma.banner.create({
      data: {
        placement: dto.placement,
        title: dto.title,
        body: dto.body ?? null,
        imageUrl: dto.imageUrl ?? null,
        linkUrl: dto.linkUrl ?? null,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
        startAt: dto.startAt ? new Date(dto.startAt) : null,
        endAt: dto.endAt ? new Date(dto.endAt) : null,
      },
    });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'BANNER_CREATE',
      targetType: 'Banner',
      targetId: created.id,
      metadata: { placement: created.placement, title: created.title },
      ctx: extractAuditCtx(req),
    });
    return created;
  }

  @Patch(':id')
  async update(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateBannerDto,
    @Req() req: Request,
  ) {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('banner not found');

    const data: Prisma.BannerUpdateInput = {};
    if (dto.placement !== undefined) data.placement = dto.placement;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.linkUrl !== undefined) data.linkUrl = dto.linkUrl;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.startAt !== undefined) {
      data.startAt = dto.startAt ? new Date(dto.startAt) : null;
    }
    if (dto.endAt !== undefined) {
      data.endAt = dto.endAt ? new Date(dto.endAt) : null;
    }

    const updated = await this.prisma.banner.update({ where: { id }, data });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'BANNER_UPDATE',
      targetType: 'Banner',
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
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('banner not found');
    await this.prisma.banner.delete({ where: { id } });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'BANNER_DELETE',
      targetType: 'Banner',
      targetId: id,
      metadata: { placement: existing.placement, title: existing.title },
      ctx: extractAuditCtx(req),
    });
  }
}
