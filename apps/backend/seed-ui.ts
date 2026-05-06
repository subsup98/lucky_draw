import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

(async () => {
  await prisma.banner.deleteMany({ where: { title: { startsWith: 'DEMO:' } } });

  await prisma.banner.create({
    data: {
      placement: 'MAIN_HERO',
      title: 'DEMO: 봄맞이 이벤트 진행 중!',
      body: '신규 회원에게 쿠폰 증정, 한정판 피규어 라인업 추가',
      imageUrl: 'https://images.unsplash.com/photo-1514036783265-fba9577fc473?w=1200&h=400&fit=crop',
      linkUrl: '/notices',
      priority: 100,
      isActive: true,
    },
  });
  await prisma.banner.create({
    data: {
      placement: 'MAIN_HERO',
      title: 'DEMO: 신작 쿠지 오픈',
      body: '콜라보 이치방쿠지 출시 기념 — 장당 5,000원부터',
      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=400&fit=crop',
      priority: 50,
      isActive: true,
    },
  });

  const sideBanners = [
    { title: 'DEMO: 첫 구매 10% 할인', body: '코드: WELCOME10', imageUrl: 'https://images.unsplash.com/photo-1607082352121-fa243f3dde32?w=400&h=200&fit=crop', priority: 30 },
    { title: 'DEMO: 라스트원 상품 안내', body: '완매 시 마지막 구매자에게 배정', imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=200&fit=crop', priority: 20 },
    { title: 'DEMO: 배송 현황 조회', body: '마이페이지에서 실시간 확인', imageUrl: null, priority: 10 },
  ];
  for (const b of sideBanners) {
    await prisma.banner.create({ data: { ...b, placement: 'MAIN_SIDE', isActive: true } });
  }

  await prisma.banner.create({
    data: {
      placement: 'KUJI_DETAIL_TOP',
      title: 'DEMO: 결제는 자동 추첨으로 즉시 진행됩니다',
      body: '추첨 후 단순변심 환불 불가',
      priority: 1,
      isActive: true,
    },
  });

  await prisma.banner.create({
    data: {
      placement: 'POPUP',
      title: 'DEMO: 환영합니다!',
      body: '첫 방문 기념 — 쿠지 둘러보고 마음에 드는 상품 찾아보세요.\n\n"하루 보지 않기" 누르면 24시간 동안 뜨지 않습니다.',
      imageUrl: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&h=300&fit=crop',
      linkUrl: '/',
      priority: 1,
      isActive: true,
    },
  });

  await prisma.siteConfig.upsert({
    where: { key: 'banner.enabled' },
    create: { key: 'banner.enabled', value: true },
    update: { value: true },
  });
  await prisma.siteConfig.upsert({
    where: { key: 'draw.animation.enabled' },
    create: { key: 'draw.animation.enabled', value: true },
    update: { value: true },
  });

  const count = await prisma.banner.count({ where: { title: { startsWith: 'DEMO:' } } });
  console.log(`seeded: ${count} banners + 2 site configs`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
