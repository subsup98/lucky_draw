import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

const INVOICE_MISSING_GRACE_MS = 24 * 60 * 60 * 1000;
const SAME_DAY_SHIPPING_CUTOFF_HOUR = 15;
const MAX_ALERTS_PER_RUN = 100;

@Injectable()
export class NotificationMonitorService {
  private readonly logger = new Logger(NotificationMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'detect-missing-invoices' })
  async detectMissingInvoices() {
    const result = await this.detectMissingInvoicesOnce();
    if (result.created > 0 || result.candidates > 0) {
      this.logger.log(
        `[missing-invoice] candidates=${result.candidates} created=${result.created}`,
      );
    }
  }

  async detectMissingInvoicesOnce(now = new Date()) {
    const cutoff = new Date(now.getTime() - INVOICE_MISSING_GRACE_MS);
    const rows = await this.prisma.order.findMany({
      where: {
        kujiEventId: null,
        status: 'PAID',
        deliveryMethod: 'SHIPPING',
        paidAt: { lte: cutoff },
        orderItems: { some: { product: { type: 'GENERAL' } } },
        shipment: {
          status: 'PREPARING',
          trackingNumber: null,
          invoiceRegisteredAt: null,
        },
      },
      orderBy: { paidAt: 'asc' },
      take: MAX_ALERTS_PER_RUN,
      select: {
        id: true,
        orderNumber: true,
        paidAt: true,
        totalAmount: true,
        orderItems: {
          select: {
            productNameSnapshot: true,
            quantity: true,
          },
          take: 3,
        },
      },
    });

    let created = 0;
    for (const order of rows) {
      if (!order.paidAt || !this.isSameDayShippingTarget(order.paidAt)) continue;
      const exists = await this.prisma.notification.findFirst({
        where: {
          orderId: order.id,
          targetType: 'ADMIN',
          messageType: 'ISSUE_OCCURRED',
          status: 'PENDING',
          message: { contains: '송장 미입력' },
        },
        select: { id: true },
      });
      if (exists) continue;

      const label = order.orderNumber ?? order.id;
      const itemLabel =
        order.orderItems
          .map((item) => `${item.productNameSnapshot} x${item.quantity}`)
          .join(', ') || '상품 주문';
      await this.notifications.adminIssue({
        orderId: order.id,
        message: `송장 미입력 주문입니다. 주문 ${label}, ${itemLabel}, 결제시각 ${order.paidAt.toISOString()}`,
      });
      created += 1;
    }

    return { candidates: rows.length, created };
  }

  private isSameDayShippingTarget(paidAt: Date) {
    return paidAt.getHours() < SAME_DAY_SHIPPING_CUTOFF_HOUR;
  }
}
