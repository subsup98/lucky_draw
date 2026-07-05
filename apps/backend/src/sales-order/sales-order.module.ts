import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SalesOrderController } from './sales-order.controller';
import { SalesOrderService } from './sales-order.service';

@Module({
  imports: [AuthModule],
  controllers: [SalesOrderController],
  providers: [SalesOrderService],
})
export class SalesOrderModule {}
