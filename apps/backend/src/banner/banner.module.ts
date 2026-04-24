import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { SiteConfigModule } from '../site-config/site-config.module';
import { AdminBannerController } from './admin-banner.controller';
import { BannerController } from './banner.controller';

@Module({
  imports: [AdminAuthModule, SiteConfigModule],
  controllers: [BannerController, AdminBannerController],
})
export class BannerModule {}
