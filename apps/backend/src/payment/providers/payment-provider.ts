export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface InitiateInput {
  orderId: string;
  userId: string;
  amount: number;
  orderName: string;
}

export interface InitiationResult {
  provider: string;
  payload: Record<string, unknown>;
}

export interface ConfirmInput {
  orderId: string;
  userId: string;
  expectedAmount: number;
  params: Record<string, unknown>;
}

export interface ConfirmResult {
  providerTxId: string;
  amount: number;
  method?: string;
  paidAt: Date;
  rawResponse: Record<string, unknown>;
}

export interface WebhookInput {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface WebhookEvent {
  providerTxId: string;
  orderId: string;
  status: 'PAID' | 'FAILED' | 'CANCELLED';
  rawResponse: Record<string, unknown>;
}

export interface RefundInput {
  providerTxId: string;
  amount: number;
  reason: string;
}

export interface RefundResult {
  refundedAt: Date;
  rawResponse: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  initiate(input: InitiateInput): Promise<InitiationResult>;
  confirm(input: ConfirmInput): Promise<ConfirmResult>;
  verifyWebhook(input: WebhookInput): Promise<WebhookEvent>;
  refund(input: RefundInput): Promise<RefundResult>;
}
