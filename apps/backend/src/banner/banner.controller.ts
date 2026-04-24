import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { BannerPlacement } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SiteConfigService } from '../site-config/site-config.service';

/**
 * 공개 배너 조회 — 비인증.
 * - placement 필수 (단일 쿼리).
 * - `SiteConfig["banner.enabled"]` 가 false 면 즉시 빈 배열(전역 킬스위치).
 * - isActive + 기간 윈도우 필터.
 */
@Controller('banners')
export class BannerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteConfig: SiteConfigService,
  ) {}

  @Get()
  async list(@Query('placement') placementRaw?: string) {
    if (!placementRaw || !(Object.values(BannerPlacement) as string[]).includes(placementRaw)) {
      throw new BadRequestException('placement required');
    }
    const enabled = await this.siteConfig.getBoolean('banner.enabled', true);
    if (!enabled) return [];

    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        placement: placementRaw as BannerPlacement,
        isActive: true,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 20,
      select: {
        id: true,
        placement: true,
        title: true,
        body: true,
        imageUrl: true,
        linkUrl: true,
        priority: true,
        startAt: true,
        endAt: true,
      },
    });
  }
}
