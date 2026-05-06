import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { AdminAuthContext, AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { extractAuditCtx } from '../audit-log/audit-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UpdateUserStatusDto } from './dto/user.dto';
import { UserService } from './user.service';

@Controller('admin/users')
@UseGuards(AdminJwtAuthGuard)
export class AdminUserController {
  constructor(
    private readonly users: UserService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  async list(
    @Query('search') search?: string,
    @Query('status') statusRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitRaw ?? '50', 10) || 50, 1), 200);
    const status =
      statusRaw && (Object.values(UserStatus) as string[]).includes(statusRaw)
        ? (statusRaw as UserStatus)
        : undefined;
    return this.users.list({ search, status, limit, cursor });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const user = await this.users.findDetail(id);
    if (!user) throw new NotFoundException('user not found');
    return user;
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: Request,
  ) {
    const before = await this.users.findDetail(id);
    if (!before) throw new NotFoundException('user not found');
    await this.users.setStatus(id, dto.status);
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'USER_STATUS_UPDATE',
      targetType: 'User',
      targetId: id,
      metadata: { from: before.status, to: dto.status },
      ctx: extractAuditCtx(req),
    });
    return { status: dto.status };
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  async withdraw(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const before = await this.users.findDetail(id);
    if (!before) throw new NotFoundException('user not found');
    const result = await this.users.withdraw(id);
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'USER_WITHDRAW',
      targetType: 'User',
      targetId: id,
      metadata: {
        previousStatus: before.status,
        withdrawnAt: result.withdrawnAt.toISOString(),
        anonymizeScheduledAt: new Date(
          result.withdrawnAt.getTime() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      ctx: extractAuditCtx(req),
    });
    return result;
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  async resetPassword(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const before = await this.users.findDetail(id);
    if (!before) throw new NotFoundException('user not found');
    const { tempPassword } = await this.users.resetPassword(id);
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'USER_PASSWORD_RESET',
      targetType: 'User',
      targetId: id,
      ctx: extractAuditCtx(req),
    });
    // 임시 비번은 응답에 1회만 노출. 별도 저장 안 됨.
    return { tempPassword };
  }
}
