import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TicketService } from './ticket.service';

@Injectable()
export class TicketCleanupService {
  private readonly logger = new Logger(TicketCleanupService.name);
  constructor(private readonly tickets: TicketService) {}

  /** 1분마다 만료된 RESERVED → AVAILABLE 복귀. */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep() {
    try {
      await this.tickets.releaseExpired();
    } catch (e) {
      this.logger.error('releaseExpired failed', e as Error);
    }
  }
}
