import { Global, Module } from '@nestjs/common';
import { NotificationMonitorService } from './notification-monitor.service';
import { NotificationService } from './notification.service';

@Global()
@Module({
  providers: [NotificationService, NotificationMonitorService],
  exports: [NotificationService],
})
export class NotificationModule {}
