import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DrawService } from './draw.service';

@Controller('orders/:orderId')
@UseGuards(JwtAuthGuard)
export class DrawController {
  constructor(private readonly draw: DrawService) {}

  @Post('draw')
  @HttpCode(200)
  execute(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.draw.execute(user.id, orderId);
  }

  @Get('draws')
  findByOrder(@CurrentUser() user: AuthUser, @Param('orderId') orderId: string) {
    return this.draw.findByOrder(user.id, orderId);
  }
}
