import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { RedisService } from '../../redis/redis.service';
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

const INTENT_TTL_SECONDS = 5 * 60;

interface IntentPayload {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  exp: number;
}

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly intentSecret: string;
  private readonly webhookSecret: string;

  constructor(private readonly redis: RedisService) {
    this.intentSecret =
      process.env.PAYMENT_INTENT_SECRET ?? 'dev_payment_intent_secret_change_me';
    this.webhookSecret =
      process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev_payment_webhook_secret_change_me';
  }

  async initiate(input: InitiateInput): Promise<InitiationResult> {
    const id = 'pi_' + randomBytes(16).toString('hex');
    const exp = Math.floor(Date.now() / 1000) + INTENT_TTL_SECONDS;
    const payload: IntentPayload = {
      id,
      orderId: input.orderId,
      userId: input.userId,
      amount: input.amount,
      exp,
    };
    const signature = this.signIntent(payload);
    await this.redis.set(
      this.intentKey(id),
      JSON.stringify(payload),
      'EX',
      INTENT_TTL_SECONDS,
    );
    return {
      provider: this.name,
      payload: {
        paymentIntentId: id,
        amount: input.amount,
        signature,
        expiresAt: new Date(exp * 1000).toISOString(),
      },
    };
  }

  async confirm(input: ConfirmInput): Promise<ConfirmResult> {
    const { paymentIntentId, signature, providerTxId } = input.params as {
      paymentIntentId?: string;
      signature?: string;
      providerTxId?: string;
    };
    if (!paymentIntentId || !signature || !providerTxId) {
      throw new BadRequestException('missing mock confirm fields');
    }

    const raw = await this.redis.get(this.intentKey(paymentIntentId));
    if (!raw) throw new BadRequestException('intent expired or unknown');

    const payload = JSON.parse(raw) as IntentPayload;
    if (payload.userId !== input.userId) throw new ForbiddenException();
    if (payload.orderId !== input.orderId) throw new BadRequestException('orderId mismatch');
    if (payload.exp * 1000 < Date.now()) {
      await this.redis.del(this.intentKey(paymentIntentId));
      throw new BadRequestException('intent expired');
    }

    const expected = this.signIntent(payload);
    const got = Buffer.from(signature);
    const exp = Buffer.from(expected);
    if (got.length !== exp.length || !timingSafeEqual(got, exp)) {
      throw new UnauthorizedException('bad intent signature');
    }
    if (payload.amount !== input.expectedAmount) {
      throw new BadRequestException('amount mismatch');
    }

    await this.redis.del(this.intentKey(paymentIntentId));

    return {
      providerTxId,
      amount: payload.amount,
      method: 'CARD',
      paidAt: new Date(),
      rawResponse: {
        source: 'mock_client_confirm',
        intentId: paymentIntentId,
        providerTxId,
      },
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return {
      refundedAt: new Date(),
      rawResponse: {
        source: 'mock_refund',
        providerTxId: input.providerTxId,
        amount: input.amount,
        reason: input.reason,
      },
    };
  }

  async verifyWebhook(input: WebhookInput): Promise<WebhookEvent> {
    const body = JSON.parse(input.rawBody) as {
      providerTxId: string;
      orderId: string;
      status: string;
    };
    const sigHeader = input.headers['x-mock-signature'];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!signature) throw new UnauthorizedException('missing signature');
    if (body.status !== 'PAID' && body.status !== 'FAILED' && body.status !== 'CANCELLED') {
      throw new BadRequestException(`unsupported status: ${body.status}`);
    }
    const expected = this.signWebhookBody(body);
    const got = Buffer.from(signature);
    const exp = Buffer.from(expected);
    if (got.length !== exp.length || !timingSafeEqual(got, exp)) {
      throw new UnauthorizedException('bad webhook signature');
    }
    return {
      providerTxId: body.providerTxId,
      orderId: body.orderId,
      status: body.status as 'PAID' | 'FAILED' | 'CANCELLED',
      rawResponse: { source: 'mock_webhook', ...body },
    };
  }

  signWebhookBody(body: { orderId: string; providerTxId: string; status: string }) {
    const msg = `${body.orderId}.${body.providerTxId}.${body.status}`;
    return createHmac('sha256', this.webhookSecret).update(msg).digest('hex');
  }

  private signIntent(payload: IntentPayload) {
    const msg = `${payload.id}.${payload.orderId}.${payload.userId}.${payload.amount}.${payload.exp}`;
    return createHmac('sha256', this.intentSecret).update(msg).digest('hex');
  }

  private intentKey(id: string) {
    return `pay:intent:${id}`;
  }
}
