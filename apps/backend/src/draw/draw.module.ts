import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShipmentModule } from '../shipment/shipment.module';
import { DrawController } from './draw.controller';
import { DrawService } from './draw.service';

@Module({
  imports: [AuthModule, ShipmentModule],
  controllers: [DrawController],
  providers: [DrawService],
  exports: [DrawService],
})
export class DrawModule {}
