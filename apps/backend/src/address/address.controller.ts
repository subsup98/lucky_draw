import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddressService } from './address.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@UseGuards(JwtAuthGuard)
@Controller('me/addresses')
export class AddressController {
  constructor(private readonly addresses: AddressService) {}

  @Get()
  list(@Req() req: Request) {
    const userId = (req as Request & { user: { id: string } }).user.id;
    return this.addresses.list(userId);
  }

  @Post()
  create(@Body() dto: CreateAddressDto, @Req() req: Request) {
    const userId = (req as Request & { user: { id: string } }).user.id;
    return this.addresses.create(userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
    @Req() req: Request,
  ) {
    const userId = (req as Request & { user: { id: string } }).user.id;
    return this.addresses.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as Request & { user: { id: string } }).user.id;
    return this.addresses.remove(userId, id);
  }
}
