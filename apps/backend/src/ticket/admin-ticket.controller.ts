import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { TicketService } from './ticket.service';

@UseGuards(AdminJwtAuthGuard)
@Controller('admin/kujis/:kujiId/tickets')
export class AdminTicketController {
  constructor(private readonly tickets: TicketService) {}

  /**
   * 쿠지 셔플 + 전체 Ticket 행 생성.
   * tier 합계가 totalTickets 와 일치해야 성공.
   * 이미 Ticket 행이 있으면 409.
   */
  @Post('seed')
  @HttpCode(200)
  async seed(@Param('kujiId') kujiId: string) {
    return this.tickets.seedForKuji(kujiId);
  }
}
