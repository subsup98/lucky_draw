import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminNoticeController } from './admin-notice.controller';
import { NoticeController } from './notice.controller';

@Module({
  imports: [AdminAuthModule],
  controllers: [NoticeController, AdminNoticeController],
})
export class NoticeModule {}
