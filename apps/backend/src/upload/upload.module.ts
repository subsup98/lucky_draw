import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { UploadController } from './upload.controller';

@Module({
  imports: [AdminAuthModule],
  controllers: [UploadController],
})
export class UploadModule {}
