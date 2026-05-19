import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsArray, ArrayMaxSize, ArrayMinSize, IsInt, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TicketService } from './ticket.service';

class ReserveDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(1_000_000, { each: true })
  positions!: number[];
}

@Controller('kujis/:kujiId/tickets')
export class TicketController {
  constructor(private readonly tickets: TicketService) {}

  /** 비인증 — 클라이언트는 자기 reserve 결과를 따로 캐싱해서 mine 표시. */
  @Get()
  async list(@Param('kujiId') kujiId: string) {
    return this.tickets.listGrid(kujiId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('reserve')
  async reserve(
    @Param('kujiId') kujiId: string,
    @Body() dto: ReserveDto,
    @Req() req: Request,
  ) {
    const userId = (req as Request & { user: { id: string } }).user.id;
    return this.tickets.reserve(kujiId, dto.positions, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('reserve')
  async release(@Param('kujiId') kujiId: string, @Req() req: Request) {
    const userId = (req as Request & { user: { id: string } }).user.id;
    return this.tickets.releaseMine(kujiId, userId);
  }
}
