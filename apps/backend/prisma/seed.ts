import { PrismaClient, KujiStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@lucky.local';
  const adminUsername = 'root';
  const adminPassword = 'AdminPass1!';
  const adminHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  await prisma.adminUser.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      email: adminEmail,
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
    },
  });

  const demoSlug = 'demo-kuji-2026';
  const existing = await prisma.kujiEvent.findUnique({ where: { slug: demoSlug } });
  if (existing) {
    console.log('[seed] demo kuji already exists, skipping');
    return;
  }

  const now = new Date();
  const saleStart = new Date(now.getTime() - 1000 * 60 * 60);
  const saleEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);

  const tierSpec = [
    { rank: 'S', name: 'S상 피규어',   qty: 1,  order: 1 },
    { rank: 'A', name: 'A상 피규어',   qty: 3,  order: 2 },
    { rank: 'B', name: 'B상 머그컵',   qty: 10, order: 3 },
    { rank: 'C', name: 'C상 아크릴',   qty: 30, order: 4 },
    { rank: 'LAST', name: '라스트원상', qty: 1, order: 99, isLast: true },
  ] as const;

  const totalTickets = tierSpec.reduce((s, t) => s + t.qty, 0);

  await prisma.$transaction(async (tx) => {
    const kuji = await tx.kujiEvent.create({
      data: {
        slug: demoSlug,
        title: '데모 이치방쿠지 2026',
        description: '시연용 쿠지. 실제 판매 아님.',
        pricePerTicket: 8800,
        totalTickets,
        perUserLimit: 10,
        saleStartAt: saleStart,
        saleEndAt: saleEnd,
        status: KujiStatus.ON_SALE,
      },
    });

    for (const t of tierSpec) {
      const tier = await tx.prizeTier.create({
        data: {
          kujiEventId: kuji.id,
          rank: t.rank,
          name: t.name,
          displayOrder: t.order,
          isLastPrize: 'isLast' in t ? !!t.isLast : false,
          totalQuantity: t.qty,
        },
      });
      await tx.inventory.create({
        data: {
          prizeTierId: tier.id,
          totalQuantity: t.qty,
          remainingQuantity: t.qty,
        },
      });
      await tx.prizeItem.create({
        data: {
          prizeTierId: tier.id,
          name: t.name,
          description: `${t.rank} 등급 상품`,
        },
      });
    }
  });

  console.log('[seed] done');
  console.log(`  admin: ${adminUsername} / ${adminPassword}`);
  console.log(`  kuji slug: ${demoSlug} (totalTickets=${totalTickets})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
