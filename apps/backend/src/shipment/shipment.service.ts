import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface ShippingSnapshot {
  recipient: string;
  phone: string;
  postalCode: string;
  addressLine1: string;
  addressLine2?: string | null;
  capturedAt?: string;
}

@Injectable()
export class ShipmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Draw 트랜잭션 내부에서 호출. Order.shippingSnapshot 을 Shipment 본체 필드로 복사.
   * `orderId` UNIQUE 덕에 중복 호출은 P2002 로 차단되므로 호출자는 draw 멱등 경로에서만 스킵하면 된다.
   */
  async createForOrderInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    snapshot: unknown,
  ) {
    const snap = this.parseSnapshot(snapshot);
    if (!snap) return null;
    return tx.shipment.create({
      data: {
        orderId,
        recipient: snap.recipient,
        phone: snap.phone,
        postalCode: snap.postalCode,
        addressLine1: snap.addressLine1,
        addressLine2: snap.addressLine2 ?? null,
      },
      select: this.shipmentSelect(),
    });
  }

  async listMine(userId: string) {
    const rows = await this.prisma.shipment.findMany({
      where: { order: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: this.shipmentSelect(),
    });
    return rows.map((r) => this.serialize(r));
  }

  async findOne(userId: string, shipmentId: string) {
    const row = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { ...this.shipmentSelect(), order: { select: { userId: true } } },
    });
    if (!row) throw new NotFoundException('shipment not found');
    if (row.order.userId !== userId) throw new ForbiddenException();
    const { order: _o, ...rest } = row;
    return this.serialize(rest);
  }

  private parseSnapshot(raw: unknown): ShippingSnapshot | null {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Record<string, unknown>;
    if (
      typeof s.recipient !== 'string' ||
      typeof s.phone !== 'string' ||
      typeof s.postalCode !== 'string' ||
      typeof s.addressLine1 !== 'string'
    ) {
      return null;
    }
    return {
      recipient: s.recipient,
      phone: s.phone,
      postalCode: s.postalCode,
      addressLine1: s.addressLine1,
      addressLine2:
        typeof s.addressLine2 === 'string' ? s.addressLine2 : null,
    };
  }

  private shipmentSelect() {
    return {
      id: true,
      orderId: true,
      recipient: true,
      phone: true,
      postalCode: true,
      addressLine1: true,
      addressLine2: true,
      carrier: true,
      trackingNumber: true,
      status: true,
      shippedAt: true,
      deliveredAt: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.ShipmentSelect;
  }

  private serialize(
    s: Prisma.ShipmentGetPayload<{
      select: ReturnType<ShipmentService['shipmentSelect']>;
    }>,
  ) {
    return s;
  }
}
