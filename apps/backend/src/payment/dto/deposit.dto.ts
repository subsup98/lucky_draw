import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmDepositDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  depositorName?: string;
}
