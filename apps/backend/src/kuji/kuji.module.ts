import { Module } from '@nestjs/common';
import { KujiController } from './kuji.controller';
import { KujiService } from './kuji.service';

@Module({
  controllers: [KujiController],
  providers: [KujiService],
  exports: [KujiService],
})
export class KujiModule {}
