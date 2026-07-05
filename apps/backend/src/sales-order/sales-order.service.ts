import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuditLogService, type AuditContext } from '../audit-log/audit-log.service';
import { FieldCipherService } from '../crypto/field-cipher.service';
import { NotificationService } from '../notification/notification.service';
import { ShippingAddressDto } from '../order/dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateSalesOrderDto, SalesOrderPaymentMethod } from './dto/create-sales-order.dto';

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;
const IDEMPOTENCY_LOCK_TTL_SECONDS = 30;

interface CachedIdempotentResponse {
  status: number;
  body: unknown;
}

@Injectable()
export class SalesOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditLogService,
    private readonly cipher: FieldCipherService,
    private readonly notifications: NotificationService,
  ) {}

  async create(
    userId: string,
    dto: CreateSalesOrderDto,
    idempotencyKey: string,
    ctx?: AuditContext,
  ): Promise<CachedIdempotentResponse> {
    const cacheKey = `idemp:sales-orders:${userId}:${idempotencyKey}`;
    const lockKey = `idemp:sales-orders:lock:${userId}:${idempotencyKey}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as CachedIdempotentResponse;

    const acquired = await this.redis.set(
      lockKey,
      '1',
      'EX',
      IDEMPOTENCY_LOCK_TTL_SECONDS,
      'NX',
    );
    if (!acquired) throw new ConflictException('duplicate request in flight');

    try {
      const cachedAfterLock = await this.redis.get(cacheKey);
      if (cachedAfterLock) return JSON.parse(cachedAfterLock) as CachedIdempotentResponse;

      const response = await this.createTransactional(userId, dto, idempotencyKey);
      await this.redis.set(cacheKey, JSON.stringify(response), 'EX', IDEMPOTENCY_TTL_SECONDS);
      const body = response.body as { id?: string; totalAmount?: number; deliveryMethod?: string };
      void this.audit.record({
        actorType: 'USER',
        actorUserId: userId,
        action: 'SALES_ORDER_CREATE',
        targetType: 'Order',
        targetId: body.id ?? null,
        ctx,
        metadata: {
          totalAmount: body.totalAmount,
          deliveryMethod: body.deliveryMethod,
          itemCount: dto.items.length,
          idempotencyKey,
        },
      });
      return response;
    } finally {
      await this.redis.del(lockKey).catch(() => undefined);
    }
  }

  private async createTransactional(
    userId: string,
    dto: CreateSalesOrderDto,
    idempotencyKey: string,
  ): Promise<CachedIdempotentResponse> {
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      select: this.orderSelect(),
    });
    if (existing) {
      if (existing.userId !== userId) throw new ConflictException('idempotency key conflict');
      return { status: 200, body: this.serializeOrder(existing) };
    }

    const itemInputs = this.mergeItems(dto.items);
    const now = new Date();
    const paymentMethod = dto.paymentMethod ?? SalesOrderPaymentMethod.BANK_TRANSFER;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const shipping =
          dto.deliveryMethod === 'SHIPPING'
            ? await this.resolveShipping(tx, userId, dto)
            : null;

        const products = await tx.product.findMany({
          where: { id: { in: itemInputs.map((i) => i.productId) } },
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
            stock: true,
            saleStatus: true,
            saleStartAt: true,
            saleEndAt: true,
          },
        });
        if (products.length !== itemInputs.length) {
          throw new NotFoundException('some products were not found');
        }

        let totalAmount = 0;
        let totalQuantity = 0;
        const orderItemData: Prisma.OrderItemCreateManyOrderInput[] = [];

        for (const item of itemInputs) {
          const product = products.find((p) => p.id === item.productId)!;
          this.assertPurchasable(product, item.quantity, now);
          totalAmount += product.price * item.quantity;
          totalQuantity += item.quantity;

          if (product.type === 'GENERAL') {
            const updated = await tx.product.updateMany({
              where: {
                id: product.id,
                stock: { gte: item.quantity },
                saleStatus: 'ON_SALE',
              },
              data: { stock: { decrement: item.quantity } },
            });
            if (updated.count !== 1) {
              throw new ConflictException(`out of stock: ${product.name}`);
            }
          }

          orderItemData.push({
            productId: product.id,
            productNameSnapshot: product.name,
            priceSnapshot: product.price,
            quantity: item.quantity,
            reservationSequence:
              product.type === 'PREORDER'
                ? await this.nextReservationSequence(tx, product.id)
                : null,
          });
        }

        const shippingSnapshot = shipping
          ? (this.cipher.encryptJson(
              { ...shipping, capturedAt: now.toISOString() },
              FieldCipherService.aad('Order', 'shippingSnapshot'),
            ) as unknown as Prisma.JsonObject)
          : null;

        const order = await tx.order.create({
          data: {
            userId,
            orderNumber: this.makeOrderNumber(),
            kujiEventId: null,
            ticketCount: totalQuantity,
            unitPrice: totalQuantity > 0 ? Math.round(totalAmount / totalQuantity) : 0,
            totalAmount,
            status: 'PENDING_PAYMENT',
            deliveryMethod: dto.deliveryMethod,
            idempotencyKey,
            shippingSnapshot: shippingSnapshot ?? Prisma.JsonNull,
            orderItems: { createMany: { data: orderItemData } },
            ...(paymentMethod === SalesOrderPaymentMethod.BANK_TRANSFER
              ? {
                  payment: {
                    create: {
                      provider: 'manual',
                      method: 'BANK_TRANSFER',
                      amount: totalAmount,
                      status: 'WAITING_DEPOSIT',
                      depositorName: dto.depositorName ?? null,
                    },
                  },
                }
              : {}),
          },
          select: { id: true },
        });

        if (dto.deliveryMethod === 'SHIPPING') {
          if (!shipping) throw new BadRequestException('shipping address required');
          await tx.shipment.create({
            data: {
              orderId: order.id,
              recipient: this.cipher.encrypt(
                shipping.recipient,
                FieldCipherService.aad('Shipment', 'recipient'),
              )!,
              phone: this.cipher.encrypt(
                shipping.phone,
                FieldCipherService.aad('Shipment', 'phone'),
              )!,
              postalCode: this.cipher.encrypt(
                shipping.postalCode,
                FieldCipherService.aad('Shipment', 'postalCode'),
              )!,
              addressLine1: this.cipher.encrypt(
                shipping.addressLine1,
                FieldCipherService.aad('Shipment', 'addressLine1'),
              )!,
              addressLine2: shipping.addressLine2
                ? this.cipher.encrypt(
                    shipping.addressLine2,
                    FieldCipherService.aad('Shipment', 'addressLine2'),
                  )
                : null,
              status: 'PENDING',
            },
          });
        } else {
          await tx.pickup.create({
            data: {
              orderId: order.id,
              status: 'WAITING',
            },
          });
        }

        await this.notifications.userOrder(
          {
            userId,
            orderId: order.id,
            messageType: 'ORDER_RECEIVED',
            message: '주문이 접수되었습니다.',
          },
          tx,
        );
        if (paymentMethod === SalesOrderPaymentMethod.BANK_TRANSFER) {
          await this.notifications.userOrder(
            {
              userId,
              orderId: order.id,
              messageType: 'DEPOSIT_REQUESTED',
              message: '무통장 입금 대기 주문이 접수되었습니다.',
            },
            tx,
          );
          await this.notifications.adminIssue(
            {
              orderId: order.id,
              message: `입금 확인이 필요한 주문이 접수되었습니다. 주문번호 ${order.id}`,
            },
            tx,
          );
        }

        const created = await tx.order.findUnique({
          where: { id: order.id },
          select: this.orderSelect(),
        });
        if (!created) throw new NotFoundException('order not found after create');
        return created;
      });

      return { status: 201, body: this.serializeOrder(created) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const dup = await this.prisma.order.findUnique({
          where: { idempotencyKey },
          select: this.orderSelect(),
        });
        if (dup && dup.userId === userId) {
          return { status: 200, body: this.serializeOrder(dup) };
        }
      }
      throw err;
    }
  }

  private mergeItems(items: CreateSalesOrderDto['items']) {
    const merged = new Map<string, number>();
    for (const item of items) {
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    }
    return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  }

  private assertPurchasable(
    product: {
      name: string;
      type: string;
      stock: number;
      saleStatus: string;
      saleStartAt: Date | null;
      saleEndAt: Date | null;
    },
    quantity: number,
    now: Date,
  ) {
    if (product.saleStatus !== 'ON_SALE') {
      throw new BadRequestException(`product not on sale: ${product.name}`);
    }
    if (product.saleStartAt && product.saleStartAt > now) {
      throw new BadRequestException(`product sale has not started: ${product.name}`);
    }
    if (product.saleEndAt && product.saleEndAt < now) {
      throw new BadRequestException(`product sale ended: ${product.name}`);
    }
    if (product.type === 'GENERAL' && product.stock < quantity) {
      throw new ConflictException(`out of stock: ${product.name}`);
    }
  }

  private async nextReservationSequence(tx: Prisma.TransactionClient, productId: string) {
    const agg = await tx.orderItem.aggregate({
      where: { productId },
      _max: { reservationSequence: true },
    });
    return (agg._max.reservationSequence ?? 0) + 1;
  }

  private async resolveShipping(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: CreateSalesOrderDto,
  ): Promise<ShippingAddressDto> {
    if (dto.addressId) {
      const addr = await tx.address.findUnique({ where: { id: dto.addressId } });
      if (!addr) throw new NotFoundException('address not found');
      if (addr.userId !== userId) throw new ForbiddenException();
      const aad = (col: string) => FieldCipherService.aad('Address', col);
      return {
        recipient: this.cipher.decrypt(addr.recipient, aad('recipient')) ?? addr.recipient,
        phone: this.cipher.decrypt(addr.phone, aad('phone')) ?? addr.phone,
        postalCode:
          this.cipher.decrypt(addr.postalCode, aad('postalCode')) ?? addr.postalCode,
        addressLine1:
          this.cipher.decrypt(addr.addressLine1, aad('addressLine1')) ?? addr.addressLine1,
        addressLine2: addr.addressLine2
          ? this.cipher.decrypt(addr.addressLine2, aad('addressLine2')) ?? addr.addressLine2
          : undefined,
      };
    }
    if (!dto.shippingAddress) throw new BadRequestException('shippingAddress required');
    if (dto.saveAddress) {
      const aad = (col: string) => FieldCipherService.aad('Address', col);
      await tx.address.create({
        data: {
          userId,
          recipient: this.cipher.encrypt(dto.shippingAddress.recipient, aad('recipient'))!,
          phone: this.cipher.encrypt(dto.shippingAddress.phone, aad('phone'))!,
          postalCode: this.cipher.encrypt(dto.shippingAddress.postalCode, aad('postalCode'))!,
          addressLine1: this.cipher.encrypt(
            dto.shippingAddress.addressLine1,
            aad('addressLine1'),
          )!,
          addressLine2: dto.shippingAddress.addressLine2
            ? this.cipher.encrypt(dto.shippingAddress.addressLine2, aad('addressLine2'))
            : null,
          isDefault: false,
        },
      });
    }
    return dto.shippingAddress;
  }

  private makeOrderNumber() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    return `SO${ymd}${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private orderSelect() {
    return {
      id: true,
      userId: true,
      orderNumber: true,
      kujiEventId: true,
      ticketCount: true,
      unitPrice: true,
      totalAmount: true,
      status: true,
      deliveryMethod: true,
      shippingSnapshot: true,
      createdAt: true,
      paidAt: true,
      cancelledAt: true,
      orderItems: {
        select: {
          id: true,
          productId: true,
          productNameSnapshot: true,
          priceSnapshot: true,
          quantity: true,
          reservationSequence: true,
          paidSequence: true,
        },
      },
      payment: {
        select: {
          id: true,
          provider: true,
          method: true,
          status: true,
          amount: true,
          depositorName: true,
          requestedAt: true,
        },
      },
      shipment: { select: { id: true, status: true } },
      pickup: { select: { id: true, status: true } },
    } satisfies Prisma.OrderSelect;
  }

  private serializeOrder(
    o: Prisma.OrderGetPayload<{ select: ReturnType<SalesOrderService['orderSelect']> }>,
  ) {
    return {
      ...o,
      shippingSnapshot: this.cipher.decryptJson(
        o.shippingSnapshot,
        FieldCipherService.aad('Order', 'shippingSnapshot'),
      ),
    };
  }
}
