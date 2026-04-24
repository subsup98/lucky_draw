import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { InquiryCategory, InquiryStatus } from '@prisma/client';

export class CreateInquiryDto {
  @IsEnum(InquiryCategory)
  category!: InquiryCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  orderId?: string;
}

export class AnswerInquiryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  answer!: string;

  @IsOptional()
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;
}

export class UpdateInquiryStatusDto {
  @IsEnum(InquiryStatus)
  status!: InquiryStatus;
}
