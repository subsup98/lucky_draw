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
import { FieldCipherService } from '../crypto/field-cipher.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateShipmentDto } from './dto/admin-shipment.dto';

type EncryptedShipmentFields = {
  recipient: string;
  phone: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string | null;
};

/**
 * 허용 전이 그래프.
 *
 * - 정방향: PENDING → PREPARING → INVOICE_REGISTERED → SHIPPED → IN_TRANSIT → DELIVERED
 * - 예외: PENDING/PREPARING 에서 CANCELLED 로 이동 가능(환불 hook).
 *         SHIPPED/IN_TRANSIT 에서 RETURNED 로 이동 가능(반송).
 *         모든 활성 상태에서 FAILED 로 이동 가능(배송 실패).
 *         주소 오류·재고 지연 등은 ON_HOLD 로 보류 가능.
 * - 역방향(예: SHIPPED → PREPARING) 금지 — 운영자가 실수로 상태를 되돌리는 것을 막는다.
 */
const ALLOWED_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
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

@Controller('admin/shipments')
@UseGuards(AdminJwtAuthGuard)
export class AdminShipmentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly cipher: FieldCipherService,
    private readonly notifications: NotificationService,
  ) {}

  private decryptShipment<T extends EncryptedShipmentFields>(s: T): T {
    return {
      ...s,
      recipient: this.cipher.decrypt(s.recipient, FieldCipherService.aad('Shipment', 'recipient')) ?? s.recipient,
      phone: this.cipher.decrypt(s.phone, FieldCipherService.aad('Shipment', 'phone')) ?? s.phone,
      postalCode:
        this.cipher.decrypt(s.postalCode, FieldCipherService.aad('Shipment', 'postalCode')) ?? s.postalCode,
      addressLine1:
        this.cipher.decrypt(s.addressLine1, FieldCipherService.aad('Shipment', 'addressLine1')) ?? s.addressLine1,
      addressLine2: s.addressLine2
        ? this.cipher.decrypt(s.addressLine2, FieldCipherService.aad('Shipment', 'addressLine2'))
        : s.addressLine2,
    };
  }

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
            orderItems: {
              select: {
                productNameSnapshot: true,
                quantity: true,
              },
            },
          },
        },
      },
    });

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    return {
      items: items.map((r) => this.decryptShipment(r)),
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
            orderItems: {
              select: {
                productNameSnapshot: true,
                quantity: true,
              },
            },
          },
        },
      },
    });
    if (!shipment) throw new NotFoundException('shipment not found');
    const decrypted = this.decryptShipment(shipment);
    return {
      ...decrypted,
      order: {
        ...decrypted.order,
        user: {
          ...decrypted.order.user,
          phone: this.cipher.decrypt(
            decrypted.order.user.phone,
            FieldCipherService.aad('User', 'phone'),
          ),
        },
      },
    };
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
      dto.trackingNumber === undefined &&
      dto.holdReason === undefined
    ) {
      throw new BadRequestException(
        'at least one of {status, carrier, trackingNumber, holdReason} required',
      );
    }

    const data: Prisma.ShipmentUpdateInput = {};
    const now = new Date();

    const nextStatus =
      dto.status ??
      (dto.carrier !== undefined && dto.trackingNumber !== undefined
        ? 'INVOICE_REGISTERED'
        : undefined);

    if (nextStatus !== undefined && nextStatus !== shipment.status) {
      const allowed = ALLOWED_TRANSITIONS[shipment.status];
      if (!allowed.includes(nextStatus)) {
        throw new ConflictException(
          `invalid transition: ${shipment.status} → ${nextStatus}`,
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
    if (dto.trackingNumber !== undefined) {
      // SHIPPED 이상에서만 trackingNumber 의미가 있으므로 경고 대신 일단 허용.
      data.trackingNumber = dto.trackingNumber;
    }
    if (dto.holdReason !== undefined) data.holdReason = dto.holdReason;

    const updated = await this.prisma.shipment.update({ where: { id }, data });
    if (nextStatus === 'INVOICE_REGISTERED') {
      await this.notifications.safeUserOrder({
        orderId: shipment.orderId,
        messageType: 'INVOICE_REGISTERED',
        message: '송장번호가 등록되었습니다.',
      });
    }
    if (nextStatus === 'SHIPPED') {
      await this.notifications.safeUserOrder({
        orderId: shipment.orderId,
        messageType: 'SHIPPING_STARTED',
        message: '배송이 시작되었습니다.',
      });
    }
    if (nextStatus === 'DELIVERED') {
      await this.notifications.safeUserOrder({
        orderId: shipment.orderId,
        messageType: 'SHIPPING_COMPLETED',
        message: '배송이 완료되었습니다.',
      });
    }
    if (nextStatus === 'ON_HOLD') {
      await this.notifications.safeAdminIssue({
        orderId: shipment.orderId,
        message: `배송 보류 주문이 발생했습니다. 주문 ID ${shipment.orderId}`,
      });
    }
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'SHIPMENT_UPDATE',
      targetType: 'Shipment',
      targetId: id,
      metadata: {
        orderId: shipment.orderId,
        from: shipment.status,
        to: nextStatus ?? shipment.status,
        changed: Object.keys(data),
        carrier: dto.carrier,
        trackingNumber: dto.trackingNumber,
        holdReason: dto.holdReason,
      },
      ctx: extractAuditCtx(req),
    });
    return updated;
  }
}
