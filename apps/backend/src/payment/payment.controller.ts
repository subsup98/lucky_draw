import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConfirmPaymentDto, CreateIntentDto, WebhookPaymentDto } from './dto/intent.dto';
import { PaymentService } from './payment.service';

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
  confirm(@CurrentUser() user: AuthUser, @Body() dto: ConfirmPaymentDto) {
    return this.payments.confirm(user.id, dto);
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Body() dto: WebhookPaymentDto,
    @Headers('x-mock-signature') signature: string | undefined,
  ) {
    return this.payments.webhook(dto, signature);
  }

  @Get(':orderId')
  @UseGuards(JwtAuthGuard)
  findByOrder(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.payments.findByOrder(user.id, orderId);
  }
}
