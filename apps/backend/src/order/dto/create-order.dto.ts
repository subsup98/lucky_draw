import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

  /**
   * v1 (랜덤 추첨) 흐름: ticketCount 만 지정.
   * v2 (픽앤팝, 사전 셔플) 흐름: ticketIds 로 사전 예약한 자리 지정 — ticketCount 무시.
   * 둘 중 하나는 반드시 채워야 한다.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  ticketCount?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  ticketIds?: string[];

  /**
   * 저장된 Address 사용 시 그 id. 인라인 shippingAddress 가 함께 오면 addressId 우선.
   * 둘 다 없으면 BadRequest.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  addressId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  /** 인라인 shippingAddress 로 결제 시 Address 로 저장. */
  @IsOptional()
  saveAddress?: boolean;
}
