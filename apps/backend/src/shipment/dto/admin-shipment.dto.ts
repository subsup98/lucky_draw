import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ShipmentStatus } from '@prisma/client';

export class UpdateShipmentDto {
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  carrier?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  trackingNumber?: string;
}
