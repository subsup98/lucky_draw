import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { BannerModule } from './banner/banner.module';
import { DrawModule } from './draw/draw.module';
import { HealthController } from './health.controller';
import { InquiryModule } from './inquiry/inquiry.module';
import { KujiModule } from './kuji/kuji.module';
import { NoticeModule } from './notice/notice.module';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { PrismaModule } from './prisma/prisma.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { RedisModule } from './redis/redis.module';
import { SiteConfigModule } from './site-config/site-config.module';
import { ShipmentModule } from './shipment/shipment.module';
import { StockModule } from './stock/stock.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    RateLimitModule,
    AuditLogModule,
    StockModule,
    AuthModule,
    AdminAuthModule,
    KujiModule,
    OrderModule,
    PaymentModule,
    DrawModule,
    ShipmentModule,
    NoticeModule,
    InquiryModule,
    SiteConfigModule,
    BannerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
