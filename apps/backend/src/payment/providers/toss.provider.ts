import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  ConfirmInput,
  ConfirmResult,
  InitiateInput,
  InitiationResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEvent,
  WebhookInput,
} from './payment-provider';

const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';
const TOSS_CANCEL_URL = (paymentKey: string) =>
  `https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`;

@Injectable()
export class TossPaymentProvider implements PaymentProvider {
  readonly name = 'toss';
  private readonly logger = new Logger(TossPaymentProvider.name);
  private readonly clientKey: string;
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor() {
    this.clientKey = process.env.TOSS_CLIENT_KEY ?? 'test_ck_docs_Ovk5rk1EwkEbP0W43n07xlzm';
    this.secretKey = process.env.TOSS_SECRET_KEY ?? 'test_sk_docs_Ovk5rk1EwkEbP0W43n07xlzm';
    this.webhookSecret = process.env.TOSS_WEBHOOK_SECRET ?? 'dev_toss_webhook_secret';
  }

  // Toss: 서버에서 별도 intent를 생성하지 않는다. 프런트가 Toss SDK로 결제창을 띄우려면
  // clientKey + orderId + amount + orderName 이 필요할 뿐. 우리는 그 값들을 돌려주기만 한다.
  async initiate(input: InitiateInput): Promise<InitiationResult> {
    return {
      provider: this.name,
      payload: {
        clientKey: this.clientKey,
        orderId: input.orderId,
        amount: input.amount,
        orderName: input.orderName,
      },
    };
  }

  // Toss 공식 흐름: 결제창 완료 → successUrl 로 (paymentKey, orderId, amount) 전달 →
  // 서버가 `POST /v1/payments/confirm` 을 Basic auth(secretKey:) 로 호출하여 결제를 확정.
  async confirm(input: ConfirmInput): Promise<ConfirmResult> {
    const { paymentKey, orderId, amount } = input.params as {
      paymentKey?: string;
      orderId?: string;
      amount?: number;
    };
    if (!paymentKey || !orderId || typeof amount !== 'number') {
      throw new BadRequestException('missing toss confirm fields');
    }
    if (orderId !== input.orderId) {
      throw new BadRequestException('orderId mismatch');
    }
    if (amount !== input.expectedAmount) {
      throw new BadRequestException('amount mismatch');
    }

    const auth = Buffer.from(`${this.secretKey}:`).toString('base64');
    let res: Response;
    try {
      res = await fetch(TOSS_CONFIRM_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `confirm_${paymentKey}`,
        },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      });
    } catch (err) {
      this.logger.error(`toss confirm network error: ${(err as Error).message}`);
      throw new InternalServerErrorException('toss gateway unreachable');
    }

    const text = await res.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.logger.error(`toss confirm non-json response: status=${res.status} body=${text.slice(0, 200)}`);
      throw new InternalServerErrorException('toss gateway bad response');
    }

    if (!res.ok) {
      // 금액/서명 불일치, 승인 실패 등 — 400/401/404 계열 모두 여기.
      const code = typeof body.code === 'string' ? body.code : 'UNKNOWN';
      const message = typeof body.message === 'string' ? body.message : 'toss confirm failed';
      this.logger.warn(`toss confirm rejected: ${code} ${message}`);
      throw new BadRequestException(`toss rejected: ${code}`);
    }

    if (body.status !== 'DONE') {
      throw new BadRequestException(`unexpected toss status: ${String(body.status)}`);
    }
    if (body.totalAmount !== amount) {
      throw new BadRequestException('toss totalAmount mismatch');
    }

    const paidAt =
      typeof body.approvedAt === 'string' ? new Date(body.approvedAt) : new Date();
    const method = typeof body.method === 'string' ? body.method : undefined;

    return {
      providerTxId: paymentKey,
      amount: body.totalAmount as number,
      method,
      paidAt,
      rawResponse: body,
    };
  }

  // 전액 환불: POST /v1/payments/{paymentKey}/cancel { cancelReason }
  // 멱등성: Idempotency-Key=refund_{paymentKey} (전액 환불은 1회만 가능하므로 동일 키 안전)
  async refund(input: RefundInput): Promise<RefundResult> {
    const auth = Buffer.from(`${this.secretKey}:`).toString('base64');
    let res: Response;
    try {
      res = await fetch(TOSS_CANCEL_URL(input.providerTxId), {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `refund_${input.providerTxId}`,
        },
        body: JSON.stringify({ cancelReason: input.reason }),
      });
    } catch (err) {
      this.logger.error(`toss refund network error: ${(err as Error).message}`);
      throw new InternalServerErrorException('toss gateway unreachable');
    }

    const text = await res.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.logger.error(`toss refund non-json response: status=${res.status} body=${text.slice(0, 200)}`);
      throw new InternalServerErrorException('toss gateway bad response');
    }

    if (!res.ok) {
      const code = typeof body.code === 'string' ? body.code : 'UNKNOWN';
      const message = typeof body.message === 'string' ? body.message : 'toss refund failed';
      this.logger.warn(`toss refund rejected: ${code} ${message}`);
      throw new BadRequestException(`toss refund rejected: ${code}`);
    }
    if (body.status !== 'CANCELED' && body.status !== 'PARTIAL_CANCELED') {
      throw new BadRequestException(`unexpected toss refund status: ${String(body.status)}`);
    }

    const cancels = Array.isArray(body.cancels) ? body.cancels : [];
    const last = cancels[cancels.length - 1] as { canceledAt?: string } | undefined;
    const refundedAt =
      last && typeof last.canceledAt === 'string' ? new Date(last.canceledAt) : new Date();

    return { refundedAt, rawResponse: body };
  }

  // Toss 웹훅은 이벤트 타입별로 포맷이 다르고 서명 검증 방식도 API마다 다르다(문서 §웹훅).
  // 여기서는 "우리 시스템이 인식하는 결제 상태 이벤트"로 단순화:
  //   헤더 `toss-signature`: HMAC-SHA256(rawBody, TOSS_WEBHOOK_SECRET), hex.
  //   body: { eventType, data: { paymentKey, orderId, status, ... } }
  async verifyWebhook(input: WebhookInput): Promise<WebhookEvent> {
    const sigHeader = input.headers['toss-signature'] ?? input.headers['x-toss-signature'];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!signature) throw new UnauthorizedException('missing toss-signature');

    const expected = createHmac('sha256', this.webhookSecret)
      .update(input.rawBody)
      .digest('hex');
    const got = Buffer.from(signature);
    const exp = Buffer.from(expected);
    if (got.length !== exp.length || !timingSafeEqual(got, exp)) {
      throw new UnauthorizedException('bad toss-signature');
    }

    const parsed = JSON.parse(input.rawBody) as {
      eventType?: string;
      data?: { paymentKey?: string; orderId?: string; status?: string };
    };
    const data = parsed.data ?? {};
    const { paymentKey, orderId, status } = data;
    if (!paymentKey || !orderId || !status) {
      throw new BadRequestException('toss webhook missing fields');
    }
    const mapped = this.mapStatus(status);
    if (!mapped) throw new BadRequestException(`unsupported toss status: ${status}`);

    return {
      providerTxId: paymentKey,
      orderId,
      status: mapped,
      rawResponse: { source: 'toss_webhook', eventType: parsed.eventType, ...data },
    };
  }

  /** 테스트용: Toss 웹훅 바디 서명을 계산 */
  signWebhookBody(rawBody: string) {
    return createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
  }

  private mapStatus(s: string): 'PAID' | 'FAILED' | 'CANCELLED' | null {
    if (s === 'DONE') return 'PAID';
    if (s === 'ABORTED' || s === 'EXPIRED') return 'FAILED';
    if (s === 'CANCELED' || s === 'PARTIAL_CANCELED') return 'CANCELLED';
    return null;
  }
}
