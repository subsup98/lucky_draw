import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { AdminInquiryController } from './admin-inquiry.controller';
import { InquiryController } from './inquiry.controller';

@Module({
  imports: [AuthModule, AdminAuthModule],
  controllers: [InquiryController, AdminInquiryController],
})
export class InquiryModule {}
