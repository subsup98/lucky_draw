import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminKujiController } from './admin-kuji.controller';
import { KujiController } from './kuji.controller';
import { KujiService } from './kuji.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [KujiController, AdminKujiController],
  providers: [KujiService],
  exports: [KujiService],
})
export class KujiModule {}
