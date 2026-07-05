import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AddressModule } from './address/address.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { BannerModule } from './banner/banner.module';
import { CryptoModule } from './crypto/crypto.module';
import { DrawModule } from './draw/draw.module';
import { HealthController } from './health.controller';
import { InquiryModule } from './inquiry/inquiry.module';
import { KujiModule } from './kuji/kuji.module';
import { NoticeModule } from './notice/notice.module';
import { NotificationModule } from './notification/notification.module';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductModule } from './product/product.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { RedisModule } from './redis/redis.module';
import { SalesOrderModule } from './sales-order/sales-order.module';
import { SiteConfigModule } from './site-config/site-config.module';
import { UploadModule } from './upload/upload.module';
import { UserModule } from './user/user.module';
import { ShipmentModule } from './shipment/shipment.module';
import { StockModule } from './stock/stock.module';
import { TicketModule } from './ticket/ticket.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    CryptoModule,
    RateLimitModule,
    AuditLogModule,
    StockModule,
    AuthModule,
    AdminAuthModule,
    KujiModule,
    ProductModule,
    OrderModule,
    SalesOrderModule,
    PaymentModule,
    DrawModule,
    ShipmentModule,
    NotificationModule,
    NoticeModule,
    InquiryModule,
    SiteConfigModule,
    BannerModule,
    UploadModule,
    UserModule,
    TicketModule,
    AddressModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
