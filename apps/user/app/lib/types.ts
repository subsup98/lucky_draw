export interface KujiSummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  pricePerTicket: number;
  totalTickets: number;
  soldTickets: number;
  perUserLimit?: number | null;
  saleStartAt: string;
  saleEndAt: string;
  status: string;
  remainingTickets: number;
  isOnSale: boolean;
}

export interface KujiDetail extends KujiSummary {
  tiers: Array<{
    id: string;
    rank: string;
    name: string;
    isLastPrize: boolean;
    inventory: { total: number; remaining: number } | null;
  }>;
}

export interface OrderResponse {
  id: string;
  kujiEventId: string;
  ticketCount: number;
  unitPrice: number;
  totalAmount: number;
  status: string;
  createdAt: string;
}

export interface IntentMockPayload {
  provider: "mock";
  paymentIntentId: string;
  signature: string;
  orderId: string;
  amount: number;
  expiresAt: string;
}

export interface IntentTossPayload {
  provider: "toss";
  clientKey: string;
  orderId: string;
  amount: number;
  orderName: string;
}

export type IntentResponse = IntentMockPayload | IntentTossPayload;

export interface DrawResultItem {
  ticketIndex: number;
  tierRank: string;
  tierName: string;
  prizeName?: string | null;
  isLastPrize: boolean;
  animationPreset?: string | null;
}

export interface DrawListResponse {
  orderId: string;
  ticketCount: number;
  results: DrawResultItem[];
}

export interface PaymentResponse {
  id: string;
  orderId: string;
  provider: string;
  providerTxId: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  paidAt: string | null;
  requestedAt: string;
}

export interface ShipmentResponse {
  id: string;
  orderId: string;
  recipient: string;
  phone: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}
