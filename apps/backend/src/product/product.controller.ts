import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get()
  list(@Query('type') type?: string, @Query('limit') limit?: string) {
    return this.products.listPublic(type, limit);
  }

  @Get(':idOrSlug')
  detail(@Param('idOrSlug') idOrSlug: string) {
    return this.products.detailPublic(idOrSlug);
  }
}
