import {
  BadRequestException,
  Body,
  ConflictException,
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
import { Prisma, KujiStatus } from '@prisma/client';
import type { Request } from 'express';
import { AdminJwtAuthGuard, AdminAuthContext } from '../admin-auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { extractAuditCtx } from '../audit-log/audit-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdjustInventoryDto,
  CreateKujiDto,
  CreateTierDto,
  UpdateKujiDto,
  UpdateKujiStatusDto,
  UpdateTierDto,
} from './dto/admin-kuji.dto';

/**
 * 관리자 쿠지/티어/재고 관리.
 *
 * 규칙:
 *   - 판매가 시작된(`soldTickets > 0`) 이벤트는 `pricePerTicket`·`totalTickets`·`saleStartAt` 변경 불가.
 *     → 티켓 발행된 주문이 있는 상태에서 가격/수량이 바뀌면 정합성 붕괴.
 *   - 티어 생성/삭제는 이벤트 status ∈ {DRAFT, SCHEDULED} 일 때만.
 *   - 재고 delta 조정은 라이브 운영 중에도 허용하되, 감소 시 `remainingQuantity` 가 0 미만으로 내려가면 거부.
 *     totalQuantity 증가 → remainingQuantity 도 동일 delta 증가(신규 재고 투입).
 *     totalQuantity 감소 → remainingQuantity 도 동일 delta 감소(폐기/회수).
 */
@Controller('admin/kujis')
@UseGuards(AdminJwtAuthGuard)
export class AdminKujiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  async list(@Query('status') status?: string, @Query('limit') limitRaw?: string) {
    const limit = Math.min(Math.max(parseInt(limitRaw ?? '100', 10) || 100, 1), 200);
    const where: Prisma.KujiEventWhereInput = {};
    if (status && (Object.values(KujiStatus) as string[]).includes(status)) {
      where.status = status as KujiStatus;
    }
    return this.prisma.kujiEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        pricePerTicket: true,
        totalTickets: true,
        soldTickets: true,
        saleStartAt: true,
        saleEndAt: true,
        createdAt: true,
      },
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const event = await this.prisma.kujiEvent.findUnique({
      where: { id },
      include: {
        prizeTiers: {
          orderBy: { displayOrder: 'asc' },
          include: {
            prizeItems: true,
            inventory: true,
          },
        },
      },
    });
    if (!event) throw new NotFoundException('kuji not found');
    return event;
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() dto: CreateKujiDto,
    @Req() req: Request,
  ) {
    const saleStartAt = new Date(dto.saleStartAt);
    const saleEndAt = new Date(dto.saleEndAt);
    if (!(saleStartAt < saleEndAt)) {
      throw new BadRequestException('saleStartAt must be before saleEndAt');
    }

    try {
      const created = await this.prisma.kujiEvent.create({
        data: {
          slug: dto.slug,
          title: dto.title,
          description: dto.description,
          coverImageUrl: dto.coverImageUrl,
          pricePerTicket: dto.pricePerTicket,
          totalTickets: dto.totalTickets,
          perUserLimit: dto.perUserLimit ?? null,
          saleStartAt,
          saleEndAt,
          status: 'DRAFT',
        },
      });
      await this.audit.record({
        actorType: 'ADMIN',
        adminUserId: admin.id,
        action: 'KUJI_CREATE',
        targetType: 'KujiEvent',
        targetId: created.id,
        metadata: { slug: created.slug, title: created.title },
        ctx: extractAuditCtx(req),
      });
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('slug already exists');
      }
      throw err;
    }
  }

  @Patch(':id')
  async update(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateKujiDto,
    @Req() req: Request,
  ) {
    const event = await this.prisma.kujiEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('kuji not found');

    const data: Prisma.KujiEventUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
    if (dto.perUserLimit !== undefined) data.perUserLimit = dto.perUserLimit;

    const saleHasStarted = event.soldTickets > 0;
    if (dto.pricePerTicket !== undefined) {
      if (saleHasStarted) {
        throw new ConflictException('cannot change pricePerTicket after tickets sold');
      }
      data.pricePerTicket = dto.pricePerTicket;
    }
    if (dto.saleStartAt !== undefined) {
      if (saleHasStarted) {
        throw new ConflictException('cannot change saleStartAt after tickets sold');
      }
      data.saleStartAt = new Date(dto.saleStartAt);
    }
    if (dto.saleEndAt !== undefined) {
      data.saleEndAt = new Date(dto.saleEndAt);
    }

    const updated = await this.prisma.kujiEvent.update({ where: { id }, data });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'KUJI_UPDATE',
      targetType: 'KujiEvent',
      targetId: id,
      metadata: { changed: Object.keys(data) },
      ctx: extractAuditCtx(req),
    });
    return updated;
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateKujiStatusDto,
    @Req() req: Request,
  ) {
    const event = await this.prisma.kujiEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('kuji not found');

    if (event.status === 'CLOSED' && dto.status !== 'CLOSED') {
      throw new ConflictException('closed event cannot be reopened');
    }
    if (dto.status === 'ON_SALE') {
      const tierCount = await this.prisma.prizeTier.count({ where: { kujiEventId: id } });
      if (tierCount === 0) {
        throw new BadRequestException('cannot go ON_SALE without prize tiers');
      }
    }

    const updated = await this.prisma.kujiEvent.update({
      where: { id },
      data: { status: dto.status },
    });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'KUJI_STATUS_UPDATE',
      targetType: 'KujiEvent',
      targetId: id,
      metadata: { from: event.status, to: dto.status },
      ctx: extractAuditCtx(req),
    });
    return updated;
  }

  @Post(':id/tiers')
  @HttpCode(201)
  async createTier(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Body() dto: CreateTierDto,
    @Req() req: Request,
  ) {
    const event = await this.prisma.kujiEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('kuji not found');
    if (event.status !== 'DRAFT' && event.status !== 'SCHEDULED') {
      throw new ConflictException('can only add tiers while DRAFT or SCHEDULED');
    }

    if (dto.isLastPrize) {
      const existing = await this.prisma.prizeTier.findFirst({
        where: { kujiEventId: id, isLastPrize: true },
      });
      if (existing) throw new ConflictException('last-prize tier already exists');
    }

    try {
      const tier = await this.prisma.$transaction(async (tx) => {
        const created = await tx.prizeTier.create({
          data: {
            kujiEventId: id,
            rank: dto.rank,
            name: dto.name,
            displayOrder: dto.displayOrder ?? 0,
            isLastPrize: dto.isLastPrize ?? false,
            totalQuantity: dto.totalQuantity,
            animationPreset: dto.animationPreset ?? null,
            prizeItems: dto.items?.length
              ? {
                  create: dto.items.map((it) => ({
                    name: it.name,
                    imageUrl: it.imageUrl,
                    description: it.description,
                    sku: it.sku,
                  })),
                }
              : undefined,
          },
          include: { prizeItems: true },
        });
        const inventory = await tx.inventory.create({
          data: {
            prizeTierId: created.id,
            totalQuantity: dto.totalQuantity,
            remainingQuantity: dto.totalQuantity,
          },
        });
        return { ...created, inventory };
      });

      await this.audit.record({
        actorType: 'ADMIN',
        adminUserId: admin.id,
        action: 'TIER_CREATE',
        targetType: 'PrizeTier',
        targetId: tier.id,
        metadata: {
          kujiEventId: id,
          rank: tier.rank,
          totalQuantity: tier.totalQuantity,
          isLastPrize: tier.isLastPrize,
        },
        ctx: extractAuditCtx(req),
      });
      return tier;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('rank already used in this event');
      }
      throw err;
    }
  }

  @Patch('tiers/:tierId')
  async updateTier(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('tierId') tierId: string,
    @Body() dto: UpdateTierDto,
    @Req() req: Request,
  ) {
    const tier = await this.prisma.prizeTier.findUnique({ where: { id: tierId } });
    if (!tier) throw new NotFoundException('tier not found');

    const data: Prisma.PrizeTierUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.displayOrder !== undefined) data.displayOrder = dto.displayOrder;
    if (dto.animationPreset !== undefined) data.animationPreset = dto.animationPreset;
    if (dto.isLastPrize !== undefined) {
      if (dto.isLastPrize && !tier.isLastPrize) {
        const existing = await this.prisma.prizeTier.findFirst({
          where: { kujiEventId: tier.kujiEventId, isLastPrize: true, NOT: { id: tierId } },
        });
        if (existing) throw new ConflictException('last-prize tier already exists');
      }
      data.isLastPrize = dto.isLastPrize;
    }
    const updated = await this.prisma.prizeTier.update({ where: { id: tierId }, data });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'TIER_UPDATE',
      targetType: 'PrizeTier',
      targetId: tierId,
      metadata: { changed: Object.keys(data) },
      ctx: extractAuditCtx(req),
    });
    return updated;
  }

  @Delete('tiers/:tierId')
  @HttpCode(204)
  async deleteTier(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('tierId') tierId: string,
    @Req() req: Request,
  ) {
    const tier = await this.prisma.prizeTier.findUnique({
      where: { id: tierId },
      include: { kujiEvent: true, _count: { select: { drawResults: true } } },
    });
    if (!tier) throw new NotFoundException('tier not found');
    if (tier._count.drawResults > 0) {
      throw new ConflictException('cannot delete tier with draw results');
    }
    if (tier.kujiEvent.status !== 'DRAFT' && tier.kujiEvent.status !== 'SCHEDULED') {
      throw new ConflictException('can only delete tiers while DRAFT or SCHEDULED');
    }
    await this.prisma.prizeTier.delete({ where: { id: tierId } });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'TIER_DELETE',
      targetType: 'PrizeTier',
      targetId: tierId,
      metadata: { kujiEventId: tier.kujiEventId, rank: tier.rank },
      ctx: extractAuditCtx(req),
    });
  }

  @Patch('tiers/:tierId/inventory')
  async adjustInventory(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('tierId') tierId: string,
    @Body() dto: AdjustInventoryDto,
    @Req() req: Request,
  ) {
    if (dto.delta === 0) throw new BadRequestException('delta must be non-zero');

    const result = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({ where: { prizeTierId: tierId } });
      if (!inv) throw new NotFoundException('inventory not found');

      const newTotal = inv.totalQuantity + dto.delta;
      const newRemaining = inv.remainingQuantity + dto.delta;
      if (newTotal < 0) throw new BadRequestException('totalQuantity cannot be negative');
      if (newRemaining < 0) {
        throw new ConflictException(
          `delta ${dto.delta} would make remaining negative (current remaining=${inv.remainingQuantity})`,
        );
      }
      const updated = await tx.inventory.update({
        where: { id: inv.id },
        data: {
          totalQuantity: newTotal,
          remainingQuantity: newRemaining,
          version: { increment: 1 },
        },
      });
      await tx.prizeTier.update({
        where: { id: tierId },
        data: { totalQuantity: newTotal },
      });
      return { before: inv, after: updated };
    });

    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'INVENTORY_ADJUST',
      targetType: 'Inventory',
      targetId: result.after.id,
      metadata: {
        tierId,
        delta: dto.delta,
        reason: dto.reason,
        totalBefore: result.before.totalQuantity,
        totalAfter: result.after.totalQuantity,
        remainingBefore: result.before.remainingQuantity,
        remainingAfter: result.after.remainingQuantity,
      },
      ctx: extractAuditCtx(req),
    });
    return result.after;
  }
}
