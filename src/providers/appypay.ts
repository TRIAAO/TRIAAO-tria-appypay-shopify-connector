import type { CreatePayment, PaymentResult, PaymentStatus } from '../domain/payment.js';

export interface AppyPayWebhookEvent {
  id: string;
  paymentId: string;
  status: PaymentStatus;
  occurredAt: string;
  raw: unknown;
}

export interface AppyPayProvider {
  createPayment(input: CreatePayment): Promise<PaymentResult>;
  getPayment(providerPaymentId: string): Promise<PaymentResult>;
  parseWebhook(payload: unknown): AppyPayWebhookEvent;
}
