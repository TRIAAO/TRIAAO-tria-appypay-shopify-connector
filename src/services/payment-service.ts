import type { CreatePayment, PaymentResult } from '../domain/payment.js';
import type { AppyPayProvider, AppyPayWebhookEvent } from '../providers/appypay.js';

export interface PaymentStore {
  findByIdempotencyKey(key: string): Promise<PaymentResult | null>;
  saveCreated(input: CreatePayment, result: PaymentResult): Promise<void>;
  recordEvent(event: AppyPayWebhookEvent): Promise<boolean>;
  updateStatus(providerPaymentId: string, status: AppyPayWebhookEvent['status']): Promise<void>;
}

export class PaymentService {
  constructor(private readonly provider: AppyPayProvider, private readonly store: PaymentStore) {}
  async create(input: CreatePayment): Promise<PaymentResult> {
    const existing = await this.store.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;
    const result = await this.provider.createPayment(input);
    await this.store.saveCreated(input, result);
    return result;
  }
  async processWebhook(payload: unknown): Promise<{ duplicate: boolean; event: AppyPayWebhookEvent }> {
    const event = this.provider.parseWebhook(payload);
    const inserted = await this.store.recordEvent(event);
    if (inserted) await this.store.updateStatus(event.paymentId, event.status);
    return { duplicate: !inserted, event };
  }
}
