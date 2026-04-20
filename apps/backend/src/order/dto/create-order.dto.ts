import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ShippingAddressDto {
  @IsString()
  @MaxLength(60)
  recipient!: string;

  @IsString()
  @MaxLength(20)
  phone!: string;

  @IsString()
  @MaxLength(10)
  postalCode!: string;

  @IsString()
  @MaxLength(200)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;
}

export class CreateOrderDto {
  @IsString()
  @MaxLength(40)
  kujiEventId!: string;

  @IsInt()
  @Min(1)
  @Max(30)
  ticketCount!: number;

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;
}
