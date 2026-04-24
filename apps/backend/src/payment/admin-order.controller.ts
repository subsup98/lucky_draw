import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import type { AdminAuthContext } from '../admin-auth/admin-jwt-auth.guard';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { extractAuditCtx } from '../audit-log/audit-context';
import { PrismaService } from '../prisma/prisma.service';
import { RefundOrderDto } from './dto/refund.dto';
import { PaymentService } from './payment.service';

const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'DRAWN',
  'CANCELLED',
  'REFUNDED',
  'FAILED',
] as const;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * 관리자 주문 관리 — 검색/상세/환불.
 * MVP 환불 정책: 전액만, 소프트 환불(재고/추첨 결과 보존), Shipment PENDING 까지만 허용.
 */
@Controller('admin/orders')
@UseGuards(AdminJwtAuthGuard)
export class AdminOrderController {
  constructor(
    private readonly payments: PaymentService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(
    @Query('status') statusRaw?: string,
    @Query('userId') userId?: string,
    @Query('kujiEventId') kujiEventId?: string,
    @Query('orderId') orderId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = Math.min(
      Math.max(parseInt(limitRaw ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const where: Prisma.OrderWhereInput = {};
    if (statusRaw && (ORDER_STATUSES as readonly string[]).includes(statusRaw)) {
      where.status = statusRaw as OrderStatus;
    }
    if (userId) where.userId = userId;
    if (kujiEventId) where.kujiEventId = kujiEventId;
    if (orderId) where.id = orderId;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
      if (to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(to);
    }

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        kujiEventId: true,
        ticketCount: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        paidAt: true,
        drawnAt: true,
        cancelledAt: true,
        user: { select: { email: true, name: true } },
        kujiEvent: { select: { title: true, slug: true } },
        payment: { select: { status: true, provider: true, refundedAt: true } },
        shipment: { select: { status: true } },
      },
    });

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;
    return { items, nextCursor, limit };
  }

  @Get(':orderId')
  async detail(@Param('orderId') orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, email: true, name: true, phone: true } },
        kujiEvent: { select: { id: true, slug: true, title: true, pricePerTicket: true } },
        payment: true,
        shipment: true,
        drawResults: {
          orderBy: { ticketIndex: 'asc' },
          include: {
            prizeTier: { select: { rank: true, name: true, isLastPrize: true } },
            prizeItem: { select: { name: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  @Post(':orderId/refund')
  @HttpCode(200)
  refund(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: RefundOrderDto,
    @Req() req: Request,
  ) {
    return this.payments.refundByAdmin(admin.id, orderId, dto.reason, extractAuditCtx(req));
  }
}
