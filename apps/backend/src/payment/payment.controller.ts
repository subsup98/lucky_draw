import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { extractAuditCtx } from '../audit-log/audit-context';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateIntentDto } from './dto/intent.dto';
import { PaymentService } from './payment.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post('intent')
  @UseGuards(JwtAuthGuard)
  intent(@CurrentUser() user: AuthUser, @Body() dto: CreateIntentDto) {
    return this.payments.createIntent(user.id, dto.orderId);
  }

  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  confirm(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.payments.confirm(user.id, body, extractAuditCtx(req));
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest) {
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    return this.payments.webhook(
      { rawBody: raw, headers: req.headers as Record<string, string | string[] | undefined> },
      extractAuditCtx(req),
    );
  }

  @Get(':orderId')
  @UseGuards(JwtAuthGuard)
  findByOrder(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.payments.findByOrder(user.id, orderId);
  }
}
