import { Type } from 'class-transformer';
import {
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
import { KujiStatus } from '@prisma/client';

export class CreateKujiDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @IsInt()
  @Min(100)
  @Max(10_000_000)
  pricePerTicket!: number;

  @IsInt()
  @Min(1)
  @Max(100_000)
  totalTickets!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  perUserLimit?: number;

  @IsDateString()
  saleStartAt!: string;

  @IsDateString()
  saleEndAt!: string;
}

export class UpdateKujiDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  pricePerTicket?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  perUserLimit?: number;

  @IsOptional()
  @IsDateString()
  saleStartAt?: string;

  @IsOptional()
  @IsDateString()
  saleEndAt?: string;
}

export class UpdateKujiStatusDto {
  @IsEnum(KujiStatus)
  status!: KujiStatus;
}

class PrizeItemInput {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;
}

export class CreateTierDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  rank!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isLastPrize?: boolean;

  @IsInt()
  @Min(1)
  @Max(100_000)
  totalQuantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  animationPreset?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PrizeItemInput)
  items?: PrizeItemInput[];
}

export class UpdateTierDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isLastPrize?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  animationPreset?: string | null;
}

export class AdjustInventoryDto {
  /**
   * totalQuantity 증감량. 양수=증가, 음수=감소.
   * remainingQuantity 에도 동일 delta 적용.
   * 감소 시 remaining 이 0 미만이 되면 거부.
   */
  @IsInt()
  @Min(-100_000)
  @Max(100_000)
  delta!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}
