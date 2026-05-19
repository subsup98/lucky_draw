import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  recipient!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  postalCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  recipient?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
