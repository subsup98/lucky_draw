import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const now = new Date();
const day = 24 * 60 * 60 * 1000;

function past(hours: number) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function future(days: number) {
  return new Date(now.getTime() + days * day);
}

function orderNumber(index: number) {
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  return `DEMO${ymd}${String(index).padStart(4, '0')}`;
}

async function ensureAdmin() {
  const username = process.env.ADMIN_SEED_USERNAME ?? 'yongoon98';
  const email = process.env.ADMIN_SEED_EMAIL ?? 'yongoon98@naver.com';
  const password = process.env.ADMIN_SEED_PASSWORD ?? 'gkdlqkdl11!!';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await prisma.adminUser.upsert({
    where: { username },
    update: {
      email,
      passwordHash,
      isActive: true,
      role: 'SUPER_ADMIN',
      mfaEnabled: false,
      totpSecret: null,
      totpEnrolledAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
    },
    create: {
      username,
      email,
      passwordHash,
      role: 'SUPER_ADMIN',
      mfaEnabled: false,
      totpSecret: null,
    },
  });
}

async function ensureProducts() {
  const preorder = await prisma.product.upsert({
    where: { slug: 'demo-preorder-figure' },
    update: {
      name: '예약 데모 피규어',
      type: 'PREORDER',
      price: 59000,
      stock: 0,
      saleStatus: 'ON_SALE',
      saleStartAt: past(24),
      saleEndAt: future(20),
      preorderOpenedAt: past(24),
      preorderClosedAt: future(10),
      expectedArrivalDate: future(14),
    },
    create: {
      slug: 'demo-preorder-figure',
      name: '예약 데모 피규어',
      description: '관리자 예약 구매 순차 발송 확인용 더미 상품입니다.',
      imageUrl: null,
      type: 'PREORDER',
      price: 59000,
      stock: 0,
      saleStatus: 'ON_SALE',
      saleStartAt: past(24),
      saleEndAt: future(20),
      preorderOpenedAt: past(24),
      preorderClosedAt: future(10),
      expectedArrivalDate: future(14),
    },
  });

  const general = await prisma.product.upsert({
    where: { slug: 'demo-general-keyring' },
    update: {
      name: '일반 데모 키링',
      type: 'GENERAL',
      price: 12000,
      stock: 42,
      saleStatus: 'ON_SALE',
      saleStartAt: past(24),
      saleEndAt: future(20),
    },
    create: {
      slug: 'demo-general-keyring',
      name: '일반 데모 키링',
      description: '관리자 일반 판매 배송 확인용 더미 상품입니다.',
      imageUrl: null,
      type: 'GENERAL',
      price: 12000,
      stock: 42,
      saleStatus: 'ON_SALE',
      saleStartAt: past(24),
      saleEndAt: future(20),
    },
  });

  return { preorder, general };
}

async function ensureUser(index: number) {
  const email = `demo-buyer-${index}@example.com`;
  const passwordHash = await argon2.hash('DemoPass1!', { type: argon2.argon2id });
  return prisma.user.upsert({
    where: { email },
    update: {
      name: `데모 구매자 ${index}`,
      phone: `010-9000-${String(index).padStart(4, '0')}`,
      status: 'ACTIVE',
    },
    create: {
      email,
      passwordHash,
      name: `데모 구매자 ${index}`,
      phone: `010-9000-${String(index).padStart(4, '0')}`,
      status: 'ACTIVE',
    },
  });
}

async function createOrder(input: {
  index: number;
  userId: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  productType: 'PREORDER' | 'GENERAL';
  deliveryMethod: 'SHIPPING' | 'PICKUP';
  orderStatus: 'PENDING_PAYMENT' | 'PAID' | 'COMPLETED';
  paymentStatus: 'WAITING_DEPOSIT' | 'PAID';
  itemStatus?: string;
  reservationSequence?: number | null;
  paidSequence?: number | null;
  paidAt?: Date | null;
  shipment?: {
    status: 'PENDING' | 'PREPARING' | 'INVOICE_REGISTERED' | 'SHIPPED' | 'DELIVERED';
    carrier?: string | null;
    trackingNumber?: string | null;
    invoiceRegisteredAt?: Date | null;
    shippedAt?: Date | null;
    deliveredAt?: Date | null;
  };
  pickup?: {
    status: 'WAITING' | 'COMPLETED';
    location?: string | null;
    scheduledAt?: Date | null;
    pickedUpAt?: Date | null;
  };
}) {
  const existing = await prisma.order.findUnique({ where: { orderNumber: orderNumber(input.index) } });
  if (existing) return existing;

  const totalAmount = input.price * input.quantity;
  return prisma.order.create({
    data: {
      userId: input.userId,
      orderNumber: orderNumber(input.index),
      kujiEventId: null,
      ticketCount: input.quantity,
      unitPrice: input.price,
      totalAmount,
      status: input.orderStatus,
      deliveryMethod: input.deliveryMethod,
      idempotencyKey: `seed-sales-demo-${input.index}`,
      paidAt: input.paidAt ?? null,
      completedAt: input.orderStatus === 'COMPLETED' ? input.pickup?.pickedUpAt ?? now : null,
      orderItems: {
        create: {
          productId: input.productId,
          productNameSnapshot: input.productName,
          priceSnapshot: input.price,
          quantity: input.quantity,
          itemStatus: input.itemStatus ?? 'PENDING',
          reservationSequence:
            input.productType === 'PREORDER' ? input.reservationSequence ?? input.index : null,
          paidSequence: input.paidSequence ?? null,
        },
      },
      payment: {
        create: {
          provider: 'manual',
          method: 'BANK_TRANSFER',
          amount: totalAmount,
          status: input.paymentStatus,
          depositorName: `데모${input.index}`,
          paidAt: input.paymentStatus === 'PAID' ? input.paidAt ?? now : null,
          confirmedAt: input.paymentStatus === 'PAID' ? input.paidAt ?? now : null,
        },
      },
      shipment:
        input.deliveryMethod === 'SHIPPING'
          ? {
              create: {
                recipient: `데모 구매자 ${input.index}`,
                phone: `010-9000-${String(input.index).padStart(4, '0')}`,
                postalCode: '04524',
                addressLine1: '서울특별시 중구 세종대로 110',
                addressLine2: `${input.index}층 데모호`,
                status: input.shipment?.status ?? 'PENDING',
                carrier: input.shipment?.carrier ?? null,
                trackingNumber: input.shipment?.trackingNumber ?? null,
                invoiceRegisteredAt: input.shipment?.invoiceRegisteredAt ?? null,
                shippedAt: input.shipment?.shippedAt ?? null,
                deliveredAt: input.shipment?.deliveredAt ?? null,
              },
            }
          : undefined,
      pickup:
        input.deliveryMethod === 'PICKUP'
          ? {
              create: {
                status: input.pickup?.status ?? 'WAITING',
                location: input.pickup?.location ?? '서울 팝업스토어 데모 카운터',
                scheduledAt: input.pickup?.scheduledAt ?? future(2),
                pickedUpAt: input.pickup?.pickedUpAt ?? null,
              },
            }
          : undefined,
      notifications: {
        create: [
          {
            targetType: 'USER',
            channel: 'INTERNAL',
            messageType: 'ORDER_RECEIVED',
            message: '더미 주문이 접수되었습니다.',
            userId: input.userId,
          },
        ],
      },
    },
  });
}

async function main() {
  await ensureAdmin();
  const { preorder, general } = await ensureProducts();
  const users = await Promise.all(Array.from({ length: 8 }, (_, i) => ensureUser(i + 1)));

  await createOrder({
    index: 1,
    userId: users[0].id,
    productId: preorder.id,
    productName: preorder.name,
    price: preorder.price,
    quantity: 1,
    productType: 'PREORDER',
    deliveryMethod: 'SHIPPING',
    orderStatus: 'PAID',
    paymentStatus: 'PAID',
    paidAt: past(72),
    reservationSequence: 1,
    paidSequence: 1,
  });

  await createOrder({
    index: 2,
    userId: users[1].id,
    productId: preorder.id,
    productName: preorder.name,
    price: preorder.price,
    quantity: 2,
    productType: 'PREORDER',
    deliveryMethod: 'SHIPPING',
    orderStatus: 'PAID',
    paymentStatus: 'PAID',
    paidAt: past(60),
    reservationSequence: 2,
    paidSequence: 2,
  });

  await createOrder({
    index: 3,
    userId: users[2].id,
    productId: preorder.id,
    productName: preorder.name,
    price: preorder.price,
    quantity: 1,
    productType: 'PREORDER',
    deliveryMethod: 'PICKUP',
    orderStatus: 'PAID',
    paymentStatus: 'PAID',
    paidAt: past(48),
    reservationSequence: 3,
    paidSequence: 3,
  });

  await createOrder({
    index: 4,
    userId: users[3].id,
    productId: preorder.id,
    productName: preorder.name,
    price: preorder.price,
    quantity: 1,
    productType: 'PREORDER',
    deliveryMethod: 'SHIPPING',
    orderStatus: 'PENDING_PAYMENT',
    paymentStatus: 'WAITING_DEPOSIT',
    reservationSequence: 4,
  });

  await createOrder({
    index: 5,
    userId: users[4].id,
    productId: general.id,
    productName: general.name,
    price: general.price,
    quantity: 3,
    productType: 'GENERAL',
    deliveryMethod: 'SHIPPING',
    orderStatus: 'PAID',
    paymentStatus: 'PAID',
    paidAt: past(30),
    shipment: { status: 'PREPARING' },
  });

  await createOrder({
    index: 6,
    userId: users[5].id,
    productId: general.id,
    productName: general.name,
    price: general.price,
    quantity: 1,
    productType: 'GENERAL',
    deliveryMethod: 'SHIPPING',
    orderStatus: 'PAID',
    paymentStatus: 'PAID',
    paidAt: past(5),
    shipment: {
      status: 'INVOICE_REGISTERED',
      carrier: 'CJ대한통운',
      trackingNumber: '123456789012',
      invoiceRegisteredAt: past(4),
    },
  });

  await createOrder({
    index: 7,
    userId: users[6].id,
    productId: general.id,
    productName: general.name,
    price: general.price,
    quantity: 1,
    productType: 'GENERAL',
    deliveryMethod: 'PICKUP',
    orderStatus: 'PAID',
    paymentStatus: 'PAID',
    paidAt: past(3),
    pickup: { status: 'WAITING', location: '서울 팝업스토어 데모 카운터' },
  });

  await createOrder({
    index: 8,
    userId: users[7].id,
    productId: general.id,
    productName: general.name,
    price: general.price,
    quantity: 2,
    productType: 'GENERAL',
    deliveryMethod: 'PICKUP',
    orderStatus: 'COMPLETED',
    paymentStatus: 'PAID',
    paidAt: past(8),
    pickup: {
      status: 'COMPLETED',
      location: '서울 팝업스토어 데모 카운터',
      pickedUpAt: past(1),
    },
  });

  const productCount = await prisma.product.count({
    where: { slug: { in: ['demo-preorder-figure', 'demo-general-keyring'] } },
  });
  const orderCount = await prisma.order.count({
    where: { orderNumber: { startsWith: `DEMO${now.getFullYear()}` } },
  });

  console.log(`[seed:sales-demo] products=${productCount} demoOrders=${orderCount}`);
  console.log('[seed:sales-demo] admin URL: http://localhost:3001');
  console.log('[seed:sales-demo] backend API: http://localhost:4000/api');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
