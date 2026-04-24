import { Module } from '@nestjs/common';
import { AdminAuditLogController } from './admin-audit-log.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';
import { AdminJwtService } from './admin-jwt.service';

@Module({
  controllers: [AdminAuthController, AdminAuditLogController],
  providers: [AdminJwtService, AdminAuthService, AdminJwtAuthGuard],
  exports: [AdminAuthService, AdminJwtAuthGuard, AdminJwtService],
})
export class AdminAuthModule {}
