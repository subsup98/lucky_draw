import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DeliveryMethod } from '@prisma/client';
import { ShippingAddressDto } from '../../order/dto/create-order.dto';

export enum SalesOrderPaymentMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
  KAKAO_PAY = 'KAKAO_PAY',
}

class SalesOrderItemDto {
  @IsString()
  @MaxLength(40)
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

export class CreateSalesOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items!: SalesOrderItemDto[];

  @IsEnum(DeliveryMethod)
  deliveryMethod!: DeliveryMethod;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  addressId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @IsOptional()
  saveAddress?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  depositorName?: string;

  @IsOptional()
  @IsEnum(SalesOrderPaymentMethod)
  paymentMethod?: SalesOrderPaymentMethod;
}
