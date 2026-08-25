import { z } from 'zod';

export const paymentMethods = ['MULTICAIXA_EXPRESS', 'REFERENCE'] as const;
export const paymentStatuses = ['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'] as const;
export type PaymentMethod = typeof paymentMethods[number];
export type PaymentStatus = typeof paymentStatuses[number];

export const createPaymentSchema = z.object({
  merchantId: z.string().min(1),
  shopifySessionId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128),
  method: z.enum(paymentMethods),
  amountMinor: z.number().int().positive(),
  currency: z.literal('AOA'),
  customer: z.object({ name: z.string().min(1), phone: z.string().min(7), email: z.string().email().optional() }),
  returnUrl: z.string().url(),
});
export type CreatePayment = z.infer<typeof createPaymentSchema>;

export interface PaymentResult {
  providerPaymentId: string;
  status: PaymentStatus;
  redirectUrl?: string;
  reference?: string;
  expiresAt?: string;
}
