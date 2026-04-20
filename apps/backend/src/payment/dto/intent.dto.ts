import { IsString, MaxLength } from 'class-validator';

export class CreateIntentDto {
  @IsString()
  @MaxLength(40)
  orderId!: string;
}

export class ConfirmPaymentDto {
  @IsString()
  @MaxLength(40)
  paymentIntentId!: string;

  @IsString()
  @MaxLength(512)
  signature!: string;

  // Mock provider 시뮬레이션 — 실 운영에서는 PG가 발급한 paymentKey
  @IsString()
  @MaxLength(128)
  providerTxId!: string;
}

export class WebhookPaymentDto {
  @IsString()
  @MaxLength(128)
  providerTxId!: string;

  @IsString()
  @MaxLength(40)
  orderId!: string;

  // "PAID" | "FAILED" | "CANCELLED"
  @IsString()
  @MaxLength(20)
  status!: string;
}
