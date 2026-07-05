import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
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
import {
  DeliveryMethod,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ShipmentStatus,
} from '@prisma/client';
import type { Request } from 'express';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import type { AdminAuthContext } from '../admin-auth/admin-jwt-auth.guard';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { extractAuditCtx } from '../audit-log/audit-context';
import { FieldCipherService } from '../crypto/field-cipher.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateShipmentDto } from '../shipment/dto/admin-shipment.dto';
import { ConfirmDepositDto } from './dto/deposit.dto';
import { CompletePickupDto } from './dto/pickup.dto';
import { RefundOrderDto } from './dto/refund.dto';
import { PaymentService } from './payment.service';

const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'DRAWN',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'FAILED',
] as const;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const ALLOWED_SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  PENDING: ['PREPARING', 'ON_HOLD', 'CANCELLED', 'FAILED'],
  PREPARING: ['INVOICE_REGISTERED', 'SHIPPED', 'ON_HOLD', 'CANCELLED', 'FAILED'],
  INVOICE_REGISTERED: ['SHIPPED', 'ON_HOLD', 'CANCELLED', 'FAILED'],
  SHIPPED: ['IN_TRANSIT', 'DELIVERED', 'ON_HOLD', 'RETURNED', 'FAILED'],
  IN_TRANSIT: ['DELIVERED', 'ON_HOLD', 'RETURNED', 'FAILED'],
  ON_HOLD: ['PREPARING', 'INVOICE_REGISTERED', 'SHIPPED', 'CANCELLED', 'FAILED'],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
  FAILED: [],
};

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
    private readonly cipher: FieldCipherService,
    private readonly notifications: NotificationService,
  ) {}

  @Get()
  async list(
    @Query('status') statusRaw?: string,
    @Query('userId') userId?: string,
    @Query('kujiEventId') kujiEventId?: string,
    @Query('productId') productId?: string,
    @Query('deliveryMethod') deliveryMethodRaw?: string,
    @Query('paymentStatus') paymentStatusRaw?: string,
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
    if (
      deliveryMethodRaw &&
      (Object.values(DeliveryMethod) as string[]).includes(deliveryMethodRaw)
    ) {
      where.deliveryMethod = deliveryMethodRaw as DeliveryMethod;
    }
    if (productId) where.orderItems = { some: { productId } };
    if (
      paymentStatusRaw &&
      (Object.values(PaymentStatus) as string[]).includes(paymentStatusRaw)
    ) {
      where.payment = { status: paymentStatusRaw as PaymentStatus };
    }
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
        orderNumber: true,
        kujiEventId: true,
        ticketCount: true,
        totalAmount: true,
        status: true,
        deliveryMethod: true,
        createdAt: true,
        paidAt: true,
        drawnAt: true,
        cancelledAt: true,
        user: { select: { email: true, name: true } },
        kujiEvent: { select: { title: true, slug: true } },
        orderItems: {
          select: {
            id: true,
            productId: true,
            productNameSnapshot: true,
            priceSnapshot: true,
            quantity: true,
            reservationSequence: true,
            paidSequence: true,
            product: { select: { id: true, name: true, type: true } },
          },
        },
        payment: {
          select: {
            status: true,
            provider: true,
            method: true,
            depositorName: true,
            paidAt: true,
            confirmedAt: true,
            refundedAt: true,
          },
        },
        shipment: {
          select: {
            id: true,
            status: true,
            carrier: true,
            trackingNumber: true,
            invoiceRegisteredAt: true,
            shippedAt: true,
            deliveredAt: true,
          },
        },
        pickup: {
          select: {
            id: true,
            status: true,
            location: true,
            scheduledAt: true,
            pickedUpAt: true,
          },
        },
      },
    });

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;
    return { items, nextCursor, limit };
  }

  @Get('stats/sales')
  async salesStats(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('period') periodRaw?: string,
    @Query('productId') productId?: string,
  ) {
    const period = ['day', 'week', 'month', 'year'].includes(periodRaw ?? '')
      ? periodRaw!
      : 'day';
    const fromDate = from ? new Date(from) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
    const toDate = to ? new Date(to) : new Date();
    if (!(fromDate <= toDate)) {
      throw new ConflictException('from must be before to');
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        period_start: Date;
        product_id: string | null;
        product_name: string;
        product_type: string | null;
        sold_quantity: bigint;
        gross_sales: bigint;
        paid_quantity: bigint;
        paid_sales: bigint;
        paid_order_count: bigint;
        waiting_deposit_count: bigint;
        refund_order_count: bigint;
      }>
    >`
      SELECT
        date_trunc(${period}, o."createdAt") AS period_start,
        oi."productId" AS product_id,
        oi."productNameSnapshot" AS product_name,
        p."type"::text AS product_type,
        COALESCE(SUM(oi."quantity"), 0)::bigint AS sold_quantity,
        COALESCE(SUM(oi."quantity" * oi."priceSnapshot"), 0)::bigint AS gross_sales,
        COALESCE(SUM(CASE WHEN pay."status" = 'PAID' THEN oi."quantity" ELSE 0 END), 0)::bigint AS paid_quantity,
        COALESCE(SUM(CASE WHEN pay."status" = 'PAID' THEN oi."quantity" * oi."priceSnapshot" ELSE 0 END), 0)::bigint AS paid_sales,
        COUNT(DISTINCT CASE WHEN pay."status" = 'PAID' THEN o."id" END)::bigint AS paid_order_count,
        COUNT(DISTINCT CASE WHEN pay."status" IN ('WAITING_DEPOSIT', 'DEPOSIT_CHECK_REQUIRED', 'REQUESTED') THEN o."id" END)::bigint AS waiting_deposit_count,
        COUNT(DISTINCT CASE WHEN pay."status" IN ('REFUNDED', 'PARTIAL_REFUNDED') OR o."status" = 'REFUNDED' THEN o."id" END)::bigint AS refund_order_count
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      LEFT JOIN "Product" p ON p."id" = oi."productId"
      LEFT JOIN "Payment" pay ON pay."orderId" = o."id"
      WHERE o."createdAt" >= ${fromDate}
        AND o."createdAt" <= ${toDate}
        AND (${productId ?? null}::text IS NULL OR oi."productId" = ${productId ?? null})
      GROUP BY period_start, oi."productId", oi."productNameSnapshot", p."type"
      ORDER BY period_start ASC, product_name ASC
    `;

    return {
      period,
      from: fromDate,
      to: toDate,
      items: rows.map((row) => ({
        periodStart: row.period_start,
        productId: row.product_id,
        productName: row.product_name,
        productType: row.product_type,
        soldQuantity: Number(row.sold_quantity),
        grossSales: Number(row.gross_sales),
        paidQuantity: Number(row.paid_quantity),
        paidSales: Number(row.paid_sales),
        paidOrderCount: Number(row.paid_order_count),
        waitingDepositCount: Number(row.waiting_deposit_count),
        refundOrderCount: Number(row.refund_order_count),
      })),
    };
  }

  @Get('products/:productId/buyers')
  async productBuyers(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('productId') productId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
    @Req() req?: Request,
  ) {
    const limit = Math.min(
      Math.max(parseInt(limitRaw ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const where: Prisma.OrderItemWhereInput = { productId };
    if (from || to) {
      where.order = { createdAt: {} };
      if (from) (where.order.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
      if (to) (where.order.createdAt as Prisma.DateTimeFilter).lte = new Date(to);
    }

    const rows = await this.prisma.orderItem.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        product: { select: { id: true, name: true, type: true } },
        order: {
          include: {
            user: { select: { id: true, email: true, name: true, phone: true } },
            payment: {
              select: {
                method: true,
                status: true,
                depositorName: true,
                paidAt: true,
                confirmedAt: true,
              },
            },
            shipment: true,
            pickup: true,
          },
        },
      },
    });

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;
    const auditCtx = req ? extractAuditCtx(req) : undefined;

    await this.prisma.privacyAccessLog.createMany({
      data: items.map((row) => ({
        adminUserId: admin.id,
        targetUserId: row.order.userId,
        orderId: row.orderId,
        accessType: 'VIEW',
        accessedField: 'product_buyers:name,phone,address',
        ip: auditCtx?.ip ?? null,
        userAgent: auditCtx?.userAgent ?? null,
      })),
    });

    return {
      items: items.map((row) => {
        const shipment = row.order.shipment
          ? this.decryptShipment(row.order.shipment)
          : null;
        return {
          orderItemId: row.id,
          product: row.product,
          productNameSnapshot: row.productNameSnapshot,
          priceSnapshot: row.priceSnapshot,
          quantity: row.quantity,
          itemStatus: row.itemStatus,
          reservationSequence: row.reservationSequence,
          paidSequence: row.paidSequence,
          order: {
            id: row.order.id,
            orderNumber: row.order.orderNumber,
            status: row.order.status,
            deliveryMethod: row.order.deliveryMethod,
            totalAmount: row.order.totalAmount,
            createdAt: row.order.createdAt,
            paidAt: row.order.paidAt,
          },
          buyer: {
            id: row.order.user.id,
            name: row.order.user.name,
            email: row.order.user.email,
            phone: this.cipher.decrypt(
              row.order.user.phone,
              FieldCipherService.aad('User', 'phone'),
            ),
          },
          payment: row.order.payment,
          shipment: shipment
            ? {
                id: shipment.id,
                carrier: shipment.carrier,
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                recipient: shipment.recipient,
                phone: shipment.phone,
                postalCode: shipment.postalCode,
                addressLine1: shipment.addressLine1,
                addressLine2: shipment.addressLine2,
              }
            : null,
          pickup: row.order.pickup
            ? {
                id: row.order.pickup.id,
                status: row.order.pickup.status,
                location: row.order.pickup.location,
                scheduledAt: row.order.pickup.scheduledAt,
                pickedUpAt: row.order.pickup.pickedUpAt,
              }
            : null,
        };
      }),
      nextCursor,
      limit,
    };
  }

  @Get('products/:productId/preorder-fulfillment')
  async preorderFulfillmentPreview(
    @Param('productId') productId: string,
    @Query('arrivalQuantity') arrivalQuantityRaw?: string,
  ) {
    const arrivalQuantity = this.parseArrivalQuantity(arrivalQuantityRaw);
    const plan = await this.buildPreorderFulfillmentPlan(productId, arrivalQuantity);
    return {
      product: plan.product,
      arrivalQuantity,
      selectedQuantity: plan.selectedQuantity,
      selectedCount: plan.selected.length,
      waitingCount: plan.waiting.length,
      selected: plan.selected,
      waiting: plan.waiting,
    };
  }

  @Post('products/:productId/preorder-fulfillment/select')
  @HttpCode(200)
  async selectPreorderFulfillmentTargets(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('productId') productId: string,
    @Body() body: { arrivalQuantity?: number | string },
    @Req() req: Request,
  ) {
    const arrivalQuantity = this.parseArrivalQuantity(body.arrivalQuantity);
    const result = await this.prisma.$transaction(async (tx) => {
      const plan = await this.buildPreorderFulfillmentPlan(productId, arrivalQuantity, tx);
      const selectedIds = plan.selected.map((item) => item.orderItemId);
      const selectedOrderIds = [...new Set(plan.selected.map((item) => item.order.id))];

      if (selectedIds.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: selectedIds }, itemStatus: 'PENDING' },
          data: { itemStatus: 'READY_TO_FULFILL' },
        });

        await tx.shipment.updateMany({
          where: {
            orderId: { in: selectedOrderIds },
            status: 'PENDING',
          },
          data: { status: 'PREPARING' },
        });
      }

      return {
        product: plan.product,
        arrivalQuantity,
        selectedQuantity: plan.selectedQuantity,
        selectedCount: plan.selected.length,
        selectedOrderItemIds: selectedIds,
        selectedOrderIds,
      };
    });

    const auditCtx = extractAuditCtx(req);
    await this.prisma.auditLog.create({
      data: {
        actorType: 'ADMIN',
        adminUserId: admin.id,
        action: 'PREORDER_FULFILLMENT_SELECT',
        targetType: 'Product',
        targetId: productId,
        ip: auditCtx.ip ?? null,
        userAgent: auditCtx.userAgent ?? null,
        metadata: result,
      },
    });

    return result;
  }

  @Get(':orderId')
  async detail(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('orderId') orderId: string,
    @Req() req: Request,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, email: true, name: true, phone: true } },
        kujiEvent: { select: { id: true, slug: true, title: true, pricePerTicket: true } },
        orderItems: {
          include: { product: { select: { id: true, name: true, type: true } } },
        },
        payment: true,
        shipment: true,
        pickup: true,
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
    const auditCtx = extractAuditCtx(req);
    await this.prisma.privacyAccessLog.create({
      data: {
        adminUserId: admin.id,
        targetUserId: order.userId,
        orderId: order.id,
        accessType: 'VIEW',
        accessedField: 'order_detail:name,phone,address',
        ip: auditCtx.ip ?? null,
        userAgent: auditCtx.userAgent ?? null,
      },
    });
    return {
      ...order,
      user: {
        ...order.user,
        phone: this.cipher.decrypt(order.user.phone, FieldCipherService.aad('User', 'phone')),
      },
      shipment: order.shipment
        ? {
            ...order.shipment,
            recipient:
              this.cipher.decrypt(order.shipment.recipient, FieldCipherService.aad('Shipment', 'recipient')) ??
              order.shipment.recipient,
            phone:
              this.cipher.decrypt(order.shipment.phone, FieldCipherService.aad('Shipment', 'phone')) ??
              order.shipment.phone,
            postalCode:
              this.cipher.decrypt(order.shipment.postalCode, FieldCipherService.aad('Shipment', 'postalCode')) ??
              order.shipment.postalCode,
            addressLine1:
              this.cipher.decrypt(order.shipment.addressLine1, FieldCipherService.aad('Shipment', 'addressLine1')) ??
              order.shipment.addressLine1,
            addressLine2: order.shipment.addressLine2
              ? this.cipher.decrypt(order.shipment.addressLine2, FieldCipherService.aad('Shipment', 'addressLine2'))
              : order.shipment.addressLine2,
          }
        : order.shipment,
    };
  }

  @Post(':orderId/pickup/complete')
  @HttpCode(200)
  async completePickup(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: CompletePickupDto,
    @Req() req: Request,
  ) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { pickup: true },
      });
      if (!order) throw new NotFoundException('order not found');
      if (order.deliveryMethod !== 'PICKUP') {
        throw new ConflictException('order is not pickup delivery method');
      }
      if (!order.pickup) throw new NotFoundException('pickup not found');
      if (order.status !== 'PAID' && order.status !== 'COMPLETED') {
        throw new ConflictException(`pickup cannot complete in order status: ${order.status}`);
      }
      if (order.pickup.status === 'COMPLETED') {
        return order.pickup;
      }
      if (order.pickup.status !== 'WAITING') {
        throw new ConflictException(`pickup cannot complete: ${order.pickup.status}`);
      }

      const pickup = await tx.pickup.update({
        where: { id: order.pickup.id },
        data: {
          status: 'COMPLETED',
          location: dto.location ?? order.pickup.location,
          pickedUpAt: now,
          confirmedByAdminId: admin.id,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          completedAt: now,
        },
      });
      await this.notifications.userOrder(
        {
          orderId,
          messageType: 'PICKUP_COMPLETED',
          message: '현장 수령이 완료되었습니다.',
        },
        tx,
      );
      return pickup;
    });

    const auditCtx = extractAuditCtx(req);
    await this.prisma.auditLog.create({
      data: {
        actorType: 'ADMIN',
        adminUserId: admin.id,
        action: 'PICKUP_COMPLETE',
        targetType: 'Pickup',
        targetId: result.id,
        ip: auditCtx.ip ?? null,
        userAgent: auditCtx.userAgent ?? null,
        metadata: { orderId, location: dto.location ?? result.location },
      },
    });
    return result;
  }

  @Post(':orderId/deposit/confirm')
  @HttpCode(200)
  confirmDeposit(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: ConfirmDepositDto,
    @Req() req: Request,
  ) {
    return this.payments.confirmDepositByAdmin(
      admin.id,
      orderId,
      dto.depositorName,
      extractAuditCtx(req),
    );
  }

  @Patch(':orderId/shipment')
  async updateOrderShipment(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateShipmentDto,
    @Req() req: Request,
  ) {
    const shipment = await this.prisma.shipment.findUnique({ where: { orderId } });
    if (!shipment) throw new NotFoundException('shipment not found');
    if (
      dto.status === undefined &&
      dto.carrier === undefined &&
      dto.trackingNumber === undefined &&
      dto.holdReason === undefined
    ) {
      throw new NotFoundException('shipment update payload required');
    }

    const now = new Date();
    const data: Prisma.ShipmentUpdateInput = {};
    const nextStatus =
      dto.status ??
      (dto.carrier !== undefined && dto.trackingNumber !== undefined
        ? 'INVOICE_REGISTERED'
        : undefined);

    if (nextStatus !== undefined && nextStatus !== shipment.status) {
      const allowed = ALLOWED_SHIPMENT_TRANSITIONS[shipment.status];
      if (!allowed.includes(nextStatus)) {
        throw new ConflictException(
          `invalid shipment transition: ${shipment.status} → ${nextStatus}`,
        );
      }
      data.status = nextStatus;
      if (nextStatus === 'INVOICE_REGISTERED' && !shipment.invoiceRegisteredAt) {
        data.invoiceRegisteredAt = now;
      }
      if (nextStatus === 'SHIPPED' && !shipment.shippedAt) data.shippedAt = now;
      if (nextStatus === 'DELIVERED' && !shipment.deliveredAt) data.deliveredAt = now;
    }
    if (dto.carrier !== undefined) data.carrier = dto.carrier;
    if (dto.trackingNumber !== undefined) data.trackingNumber = dto.trackingNumber;
    if (dto.holdReason !== undefined) data.holdReason = dto.holdReason;

    const updated = await this.prisma.shipment.update({
      where: { id: shipment.id },
      data,
    });

    if (nextStatus === 'INVOICE_REGISTERED') {
      await this.notifications.safeUserOrder({
        orderId,
        messageType: 'INVOICE_REGISTERED',
        message: '송장번호가 등록되었습니다.',
      });
    }
    if (nextStatus === 'SHIPPED') {
      await this.notifications.safeUserOrder({
        orderId,
        messageType: 'SHIPPING_STARTED',
        message: '배송이 시작되었습니다.',
      });
    }
    if (nextStatus === 'DELIVERED') {
      await this.notifications.safeUserOrder({
        orderId,
        messageType: 'SHIPPING_COMPLETED',
        message: '배송이 완료되었습니다.',
      });
    }
    if (nextStatus === 'ON_HOLD') {
      await this.notifications.safeAdminIssue({
        orderId,
        message: `배송 보류 주문이 발생했습니다. 주문 ID ${orderId}`,
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorType: 'ADMIN',
        adminUserId: admin.id,
        action: 'ORDER_SHIPMENT_UPDATE',
        targetType: 'Shipment',
        targetId: shipment.id,
        ip: extractAuditCtx(req).ip ?? null,
        userAgent: extractAuditCtx(req).userAgent ?? null,
        metadata: {
          orderId,
          from: shipment.status,
          to: nextStatus ?? shipment.status,
          changed: Object.keys(data),
          carrier: dto.carrier,
          trackingNumber: dto.trackingNumber,
          holdReason: dto.holdReason,
        },
      },
    });
    return updated;
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

  private decryptShipment<T extends {
    recipient: string;
    phone: string;
    postalCode: string;
    addressLine1: string;
    addressLine2: string | null;
  }>(shipment: T): T {
    return {
      ...shipment,
      recipient:
        this.cipher.decrypt(shipment.recipient, FieldCipherService.aad('Shipment', 'recipient')) ??
        shipment.recipient,
      phone:
        this.cipher.decrypt(shipment.phone, FieldCipherService.aad('Shipment', 'phone')) ??
        shipment.phone,
      postalCode:
        this.cipher.decrypt(shipment.postalCode, FieldCipherService.aad('Shipment', 'postalCode')) ??
        shipment.postalCode,
      addressLine1:
        this.cipher.decrypt(shipment.addressLine1, FieldCipherService.aad('Shipment', 'addressLine1')) ??
        shipment.addressLine1,
      addressLine2: shipment.addressLine2
        ? this.cipher.decrypt(shipment.addressLine2, FieldCipherService.aad('Shipment', 'addressLine2'))
        : shipment.addressLine2,
    };
  }

  private parseArrivalQuantity(raw: number | string | undefined) {
    const parsed = typeof raw === 'number' ? raw : parseInt(raw ?? '', 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('arrivalQuantity must be a positive integer');
    }
    return parsed;
  }

  private async buildPreorderFulfillmentPlan(
    productId: string,
    arrivalQuantity: number,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        type: true,
        expectedArrivalDate: true,
      },
    });
    if (!product) throw new NotFoundException('product not found');
    if (product.type !== 'PREORDER') {
      throw new ConflictException('product is not preorder');
    }

    const rows = await tx.orderItem.findMany({
      where: {
        productId,
        itemStatus: 'PENDING',
        paidSequence: { not: null },
        product: { type: 'PREORDER' },
        order: {
          status: 'PAID',
          payment: { is: { status: 'PAID' } },
        },
      },
      orderBy: [{ paidSequence: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            deliveryMethod: true,
            totalAmount: true,
            createdAt: true,
            paidAt: true,
            user: { select: { id: true, email: true, name: true } },
            shipment: {
              select: {
                id: true,
                status: true,
                carrier: true,
                trackingNumber: true,
              },
            },
            pickup: {
              select: {
                id: true,
                status: true,
                location: true,
                scheduledAt: true,
              },
            },
          },
        },
      },
    });

    const selected: ReturnType<typeof this.serializeFulfillmentItem>[] = [];
    const waiting: ReturnType<typeof this.serializeFulfillmentItem>[] = [];
    let selectedQuantity = 0;
    let selecting = true;

    for (const row of rows) {
      const nextQuantity = selectedQuantity + row.quantity;
      if (selecting && nextQuantity <= arrivalQuantity) {
        selected.push(this.serializeFulfillmentItem(row));
        selectedQuantity = nextQuantity;
      } else {
        selecting = false;
        waiting.push(this.serializeFulfillmentItem(row));
      }
    }

    return { product, selectedQuantity, selected, waiting };
  }

  private serializeFulfillmentItem(row: Prisma.OrderItemGetPayload<{
    include: {
      order: {
        select: {
          id: true;
          orderNumber: true;
          status: true;
          deliveryMethod: true;
          totalAmount: true;
          createdAt: true;
          paidAt: true;
          user: { select: { id: true; email: true; name: true } };
          shipment: {
            select: {
              id: true;
              status: true;
              carrier: true;
              trackingNumber: true;
            };
          };
          pickup: {
            select: {
              id: true;
              status: true;
              location: true;
              scheduledAt: true;
            };
          };
        };
      };
    };
  }>) {
    return {
      orderItemId: row.id,
      quantity: row.quantity,
      itemStatus: row.itemStatus,
      reservationSequence: row.reservationSequence,
      paidSequence: row.paidSequence,
      order: {
        id: row.order.id,
        orderNumber: row.order.orderNumber,
        status: row.order.status,
        deliveryMethod: row.order.deliveryMethod,
        totalAmount: row.order.totalAmount,
        createdAt: row.order.createdAt,
        paidAt: row.order.paidAt,
      },
      buyer: row.order.user,
      shipment: row.order.shipment,
      pickup: row.order.pickup,
    };
  }
}
