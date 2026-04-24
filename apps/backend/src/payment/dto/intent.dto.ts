import { IsString, MaxLength } from 'class-validator';

export class CreateIntentDto {
  @IsString()
  @MaxLength(40)
  orderId!: string;
}
