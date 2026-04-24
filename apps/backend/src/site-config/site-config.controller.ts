import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthContext, AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { extractAuditCtx } from '../audit-log/audit-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import { SetConfigDto } from './dto/site-config.dto';
import { SiteConfigService } from './site-config.service';

/**
 * 공개 설정 조회 — 비인증.
 * 사용자 웹이 "배너 모듈 끄기" 등의 킬스위치 상태를 알기 위해 사용.
 */
@Controller('site-config')
export class PublicSiteConfigController {
  constructor(private readonly svc: SiteConfigService) {}

  @Get('public')
  async all() {
    // 현재는 모든 키가 공개 대상. 민감 키가 생기면 여기서 필터링.
    return this.svc.getAll();
  }
}

@Controller('admin/site-config')
@UseGuards(AdminJwtAuthGuard)
export class AdminSiteConfigController {
  constructor(
    private readonly svc: SiteConfigService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  async list() {
    return this.svc.getAll();
  }

  @Put(':key')
  async set(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('key') key: string,
    @Body() dto: SetConfigDto,
    @Req() req: Request,
  ) {
    const result = await this.svc.set(key, dto.value as never);
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'SITE_CONFIG_UPDATE',
      targetType: 'SiteConfig',
      targetId: key,
      metadata: { key, value: dto.value as never },
      ctx: extractAuditCtx(req),
    });
    return result;
  }
}
