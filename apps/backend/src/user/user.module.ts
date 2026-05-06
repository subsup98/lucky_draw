import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { AdminUserController } from './admin-user.controller';
import { MeUserController } from './me-user.controller';
import { UserCron } from './user.cron';
import { UserService } from './user.service';

@Module({
  imports: [AuthModule, AdminAuthModule],
  controllers: [AdminUserController, MeUserController],
  providers: [UserService, UserCron],
  exports: [UserService],
})
export class UserModule {}
