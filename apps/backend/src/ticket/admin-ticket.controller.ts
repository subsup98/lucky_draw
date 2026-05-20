import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { TicketService } from './ticket.service';

@UseGuards(AdminJwtAuthGuard)
@Controller('admin/kujis/:kujiId/tickets')
export class AdminTicketController {
  constructor(private readonly tickets: TicketService) {}

  /** 운영자 자리 맵 — 모든 자리의 position + status + tier 공개. */
  @Get()
  async list(@Param('kujiId') kujiId: string) {
    return this.tickets.adminListGrid(kujiId);
  }

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

  /**
   * 자리 재셔플 — 판매(SOLD)/점유(RESERVED) 0건일 때만 가능.
   * 기존 Ticket 전체 삭제 후 다시 셔플 생성.
   */
  @Post('reshuffle')
  @HttpCode(200)
  async reshuffle(@Param('kujiId') kujiId: string) {
    return this.tickets.reshuffleForKuji(kujiId);
  }
}
