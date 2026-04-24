import { Global, Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import {
  AdminSiteConfigController,
  PublicSiteConfigController,
} from './site-config.controller';
import { SiteConfigService } from './site-config.service';

@Global()
@Module({
  imports: [AdminAuthModule],
  controllers: [PublicSiteConfigController, AdminSiteConfigController],
  providers: [SiteConfigService],
  exports: [SiteConfigService],
})
export class SiteConfigModule {}
