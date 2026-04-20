import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DrawModule } from './draw/draw.module';
import { HealthController } from './health.controller';
import { KujiModule } from './kuji/kuji.module';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { ShipmentModule } from './shipment/shipment.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    KujiModule,
    OrderModule,
    PaymentModule,
    DrawModule,
    ShipmentModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
