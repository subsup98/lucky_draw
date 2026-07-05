import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompletePickupDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;
}
