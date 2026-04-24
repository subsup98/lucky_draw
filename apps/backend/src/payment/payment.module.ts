import { Logger, Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { DrawModule } from '../draw/draw.module';
import { AdminOrderController } from './admin-order.controller';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { MockPaymentProvider } from './providers/mock.provider';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider';
import { TossPaymentProvider } from './providers/toss.provider';

@Module({
  imports: [AuthModule, AdminAuthModule, DrawModule],
  controllers: [PaymentController, AdminOrderController],
  providers: [
    MockPaymentProvider,
    TossPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (mock: MockPaymentProvider, toss: TossPaymentProvider): PaymentProvider => {
        const name = (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase();
        const selected = name === 'toss' ? toss : mock;
        new Logger('PaymentModule').log(`payment provider = ${selected.name}`);
        return selected;
      },
      inject: [MockPaymentProvider, TossPaymentProvider],
    },
    PaymentService,
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
