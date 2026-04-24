import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefundOrderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}
