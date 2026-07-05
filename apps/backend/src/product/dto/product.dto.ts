import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProductSaleStatus, ProductType } from '@prisma/client';

export class CreateProductDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsEnum(ProductType)
  type!: ProductType;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  price!: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock!: number;

  @IsOptional()
  @IsDateString()
  saleStartAt?: string;

  @IsOptional()
  @IsDateString()
  saleEndAt?: string;

  @IsOptional()
  @IsDateString()
  preorderOpenedAt?: string;

  @IsOptional()
  @IsDateString()
  preorderClosedAt?: string;

  @IsOptional()
  @IsDateString()
  expectedArrivalDate?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number;

  @IsOptional()
  @IsDateString()
  saleStartAt?: string | null;

  @IsOptional()
  @IsDateString()
  saleEndAt?: string | null;

  @IsOptional()
  @IsDateString()
  preorderOpenedAt?: string | null;

  @IsOptional()
  @IsDateString()
  preorderClosedAt?: string | null;

  @IsOptional()
  @IsDateString()
  expectedArrivalDate?: string | null;
}

export class UpdateProductStatusDto {
  @IsEnum(ProductSaleStatus)
  saleStatus!: ProductSaleStatus;
}
