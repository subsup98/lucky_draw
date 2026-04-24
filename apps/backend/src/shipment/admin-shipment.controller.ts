import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma, ShipmentStatus } from '@prisma/client';
import type { Request } from 'express';
import { AdminJwtAuthGuard, AdminAuthContext } from '../admin-auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { extractAuditCtx } from '../audit-log/audit-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateShipmentDto } from './dto/admin-shipment.dto';

/**
 * 허용 전이 그래프.
 *
 * - 정방향: PENDING → PREPARING → SHIPPED → IN_TRANSIT → DELIVERED
 * - 예외: PENDING/PREPARING 에서 CANCELLED 로 이동 가능(환불 hook).
 *         SHIPPED/IN_TRANSIT 에서 RETURNED 로 이동 가능(반송).
 *         모든 활성 상태에서 FAILED 로 이동 가능(배송 실패).
 * - 역방향(예: SHIPPED → PREPARING) 금지 — 운영자가 실수로 상태를 되돌리는 것을 막는다.
 */
const ALLOWED_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  PENDING: ['PREPARING', 'CANCELLED', 'FAILED'],
  PREPARING: ['SHIPPED', 'CANCELLED', 'FAILED'],
  SHIPPED: ['IN_TRANSIT', 'DELIVERED', 'RETURNED', 'FAILED'],
  IN_TRANSIT: ['DELIVERED', 'RETURNED', 'FAILED'],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
  FAILED: [],
};

@Controller('admin/shipments')
@UseGuards(AdminJwtAuthGuard)
export class AdminShipmentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  async list(
    @Query('status') statusRaw?: string,
    @Query('trackingNumber') trackingNumber?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitRaw ?? '50', 10) || 50, 1), 200);
    const where: Prisma.ShipmentWhereInput = {};
    if (statusRaw && (Object.values(ShipmentStatus) as string[]).includes(statusRaw)) {
      where.status = statusRaw as ShipmentStatus;
    }
    if (trackingNumber) where.trackingNumber = trackingNumber;

    const rows = await this.prisma.shipment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        order: {
          select: {
            id: true,
            userId: true,
            kujiEventId: true,
            ticketCount: true,
            status: true,
            user: { select: { email: true, name: true } },
            kujiEvent: { select: { title: true } },
          },
        },
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
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            user: { select: { id: true, email: true, name: true, phone: true } },
            kujiEvent: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });
    if (!shipment) throw new NotFoundException('shipment not found');
    return shipment;
  }

  @Patch(':id')
  async update(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateShipmentDto,
    @Req() req: Request,
  ) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id } });
    if (!shipment) throw new NotFoundException('shipment not found');

    if (
      dto.status === undefined &&
      dto.carrier === undefined &&
      dto.trackingNumber === undefined
    ) {
      throw new BadRequestException('at least one of {status, carrier, trackingNumber} required');
    }

    const data: Prisma.ShipmentUpdateInput = {};
    const now = new Date();

    if (dto.status !== undefined && dto.status !== shipment.status) {
      const allowed = ALLOWED_TRANSITIONS[shipment.status];
      if (!allowed.includes(dto.status)) {
        throw new ConflictException(
          `invalid transition: ${shipment.status} → ${dto.status}`,
        );
      }
      data.status = dto.status;
      if (dto.status === 'SHIPPED' && !shipment.shippedAt) data.shippedAt = now;
      if (dto.status === 'DELIVERED' && !shipment.deliveredAt) data.deliveredAt = now;
    }

    if (dto.carrier !== undefined) data.carrier = dto.carrier;
    if (dto.trackingNumber !== undefined) {
      // SHIPPED 이상에서만 trackingNumber 의미가 있으므로 경고 대신 일단 허용.
      data.trackingNumber = dto.trackingNumber;
    }

    const updated = await this.prisma.shipment.update({ where: { id }, data });
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'SHIPMENT_UPDATE',
      targetType: 'Shipment',
      targetId: id,
      metadata: {
        orderId: shipment.orderId,
        from: shipment.status,
        to: data.status ?? shipment.status,
        changed: Object.keys(data),
        carrier: dto.carrier,
        trackingNumber: dto.trackingNumber,
      },
      ctx: extractAuditCtx(req),
    });
    return updated;
  }
}
