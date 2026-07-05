import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminJwtAuthGuard, AdminAuthContext } from '../admin-auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { extractAuditCtx } from '../audit-log/audit-context';
import {
  CreateProductDto,
  UpdateProductDto,
  UpdateProductStatusDto,
} from './dto/product.dto';
import { ProductService } from './product.service';

@Controller('admin/products')
@UseGuards(AdminJwtAuthGuard)
export class AdminProductController {
  constructor(private readonly products: ProductService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    return this.products.listAdmin(status, type, limit);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.products.detailAdmin(id);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() dto: CreateProductDto,
    @Req() req: Request,
  ) {
    return this.products.createAdmin(admin.id, dto, extractAuditCtx(req));
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Req() req: Request,
  ) {
    return this.products.updateAdmin(admin.id, id, dto, extractAuditCtx(req));
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductStatusDto,
    @Req() req: Request,
  ) {
    return this.products.updateStatusAdmin(
      admin.id,
      id,
      dto.saleStatus,
      extractAuditCtx(req),
    );
  }

  @Delete(':id')
  delete(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.products.deleteAdmin(admin.id, id, extractAuditCtx(req));
  }
}
