import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShipmentService } from './shipment.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ShipmentController {
  constructor(private readonly shipment: ShipmentService) {}

  @Get('me/shipments')
  listMine(@CurrentUser() user: AuthUser) {
    return this.shipment.listMine(user.id);
  }

  @Get('shipments/:shipmentId')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('shipmentId') shipmentId: string,
  ) {
    return this.shipment.findOne(user.id, shipmentId);
  }
}
