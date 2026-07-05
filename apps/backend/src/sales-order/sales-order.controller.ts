import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { extractAuditCtx } from '../audit-log/audit-context';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { SalesOrderService } from './sales-order.service';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_\-]{16,128}$/;

@Controller('sales-orders')
@UseGuards(JwtAuthGuard)
export class SalesOrderController {
  constructor(private readonly salesOrders: SalesOrderService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSalesOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key header required (16-128 chars, alnum/_/-)');
    }
    const result = await this.salesOrders.create(
      user.id,
      dto,
      idempotencyKey,
      extractAuditCtx(req),
    );
    res.status(result.status);
    return result.body;
  }
}
