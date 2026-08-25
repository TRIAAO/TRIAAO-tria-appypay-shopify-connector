import type { CreatePayment, PaymentResult } from '../domain/payment.js';
import type { AppyPayWebhookEvent } from '../providers/appypay.js';
import type { PaymentStore } from '../services/payment-service.js';

export class InMemoryPaymentStore implements PaymentStore {
  readonly payments = new Map<string, PaymentResult>();
  readonly events = new Set<string>();
  async findByIdempotencyKey(key: string) { return this.payments.get(key) ?? null; }
  async saveCreated(input: CreatePayment, result: PaymentResult) { this.payments.set(input.idempotencyKey, result); }
  async recordEvent(event: AppyPayWebhookEvent) { if (this.events.has(event.id)) return false; this.events.add(event.id); return true; }
  async updateStatus(providerPaymentId: string, status: AppyPayWebhookEvent['status']) {
    for (const [key, payment] of this.payments) if (payment.providerPaymentId === providerPaymentId) this.payments.set(key, { ...payment, status });
  }
}
