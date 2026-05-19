import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { AdminTicketController } from './admin-ticket.controller';
import { TicketCleanupService } from './ticket-cleanup.service';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';

@Module({
  imports: [AuthModule, AdminAuthModule],
  providers: [TicketService, TicketCleanupService],
  controllers: [TicketController, AdminTicketController],
  exports: [TicketService],
})
export class TicketModule {}
