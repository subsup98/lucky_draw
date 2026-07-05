import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminProductController } from './admin-product.controller';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [ProductController, AdminProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
