import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CreatePayment, PaymentResult } from '../domain/payment.js';
import type { AppyPayProvider, AppyPayWebhookEvent } from './appypay.js';

const webhookSchema = z.object({ id: z.string(), paymentId: z.string(), status: z.enum(['PENDING','PAID','FAILED','EXPIRED','CANCELLED','REFUNDED']), occurredAt: z.string().datetime() });

export class MockAppyPayProvider implements AppyPayProvider {
  readonly payments = new Map<string, PaymentResult>();
  async createPayment(input: CreatePayment): Promise<PaymentResult> {
    const id = `mock_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const result: PaymentResult = input.method === 'REFERENCE'
      ? { providerPaymentId: id, status: 'PENDING', reference: String(Math.floor(100000000 + Math.random() * 900000000)), expiresAt }
      : { providerPaymentId: id, status: 'PENDING', redirectUrl: `${input.returnUrl}?mockPaymentId=${encodeURIComponent(id)}`, expiresAt };
    this.payments.set(id, result);
    return result;
  }
  async getPayment(providerPaymentId: string): Promise<PaymentResult> {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) throw new Error('PAYMENT_NOT_FOUND');
    return payment;
  }
  parseWebhook(payload: unknown): AppyPayWebhookEvent {
    const event = webhookSchema.parse(payload);
    return { ...event, raw: payload };
  }
}
