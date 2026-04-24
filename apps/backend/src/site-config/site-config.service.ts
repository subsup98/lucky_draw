import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 전역 설정 key-value 스토어.
 *
 * 알려진 키:
 *   - "banner.enabled" (boolean, default true) — 전체 배너 모듈 on/off
 *   - "draw.animation.enabled" (boolean, default true) — 추첨 연출 on/off
 *
 * 노출 정책: 모든 키가 공개 API 로 노출되므로 민감 설정은 여기 두지 않는다.
 */
@Injectable()
export class SiteConfigService {
  private readonly logger = new Logger(SiteConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBoolean(key: string, defaultValue: boolean): Promise<boolean> {
    try {
      const row = await this.prisma.siteConfig.findUnique({ where: { key } });
      if (!row) return defaultValue;
      if (typeof row.value === 'boolean') return row.value;
      return defaultValue;
    } catch (err) {
      this.logger.warn(`siteConfig get(${key}) failed: ${String(err)} — falling back to default`);
      return defaultValue;
    }
  }

  async getAll(): Promise<Record<string, Prisma.JsonValue>> {
    const rows = await this.prisma.siteConfig.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async set(key: string, value: Prisma.InputJsonValue) {
    return this.prisma.siteConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
