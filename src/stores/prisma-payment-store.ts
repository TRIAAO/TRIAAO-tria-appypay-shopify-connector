import { Prisma, PrismaClient, type Payment as DbPayment } from '@prisma/client';
import type { CreatePayment, PaymentResult, PaymentView } from '../domain/payment.js';
import type { AppyPayWebhookEvent } from '../providers/appypay.js';
import type { PaymentStore } from '../services/payment-service.js';

const toResult = (payment: DbPayment): PaymentResult => ({
  providerPaymentId: payment.appyPayPaymentId ?? payment.id,
  status: payment.status,
  ...(payment.redirectUrl ? { redirectUrl: payment.redirectUrl } : {}),
  ...(payment.reference ? { reference: payment.reference } : {}),
  ...(payment.expiresAt ? { expiresAt: payment.expiresAt.toISOString() } : {}),
});

export class PrismaPaymentStore implements PaymentStore {
  constructor(readonly prisma: PrismaClient) {}

  async findByIdempotencyKey(key: string): Promise<PaymentResult | null> {
    const payment = await this.prisma.payment.findUnique({ where: { idempotencyKey: key } });
    return payment ? toResult(payment) : null;
  }

  async saveCreated(input: CreatePayment, result: PaymentResult): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const merchant = await tx.merchant.upsert({
        where: { shopDomain: input.merchantId },
        update: {},
        create: { shopDomain: input.merchantId, active: true },
      });
      await tx.payment.create({
        data: {
          merchantId: merchant.id,
          shopifySessionId: input.shopifySessionId,
          appyPayPaymentId: result.providerPaymentId,
          idempotencyKey: input.idempotencyKey,
          method: input.method,
          status: result.status,
          amountMinor: BigInt(input.amountMinor),
          currency: input.currency,
          redirectUrl: result.redirectUrl ?? null,
          reference: result.reference ?? null,
          expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
        },
      });
    });
  }

  async recordEvent(event: AppyPayWebhookEvent): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({ where: { appyPayPaymentId: event.paymentId }, select: { id: true } });
    if (!payment) throw new Error('PAYMENT_NOT_FOUND');
    try {
      await this.prisma.paymentEvent.create({ data: { paymentId: payment.id, providerId: event.id, eventType: event.status, payload: event.raw as Prisma.InputJsonValue } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }

  async updateStatus(providerPaymentId: string, status: AppyPayWebhookEvent['status']): Promise<void> {
    await this.prisma.payment.update({ where: { appyPayPaymentId: providerPaymentId }, data: { status } });
  }

  async listRecent(limit: number): Promise<PaymentView[]> {
    const payments = await this.prisma.payment.findMany({ take: Math.min(Math.max(limit, 1), 200), orderBy: { createdAt: 'desc' }, include: { merchant: { select: { shopDomain: true } } } });
    return payments.map(payment => ({
      ...toResult(payment),
      id: payment.id,
      merchant: payment.merchant.shopDomain,
      shopifySessionId: payment.shopifySessionId,
      method: payment.method,
      amountMinor: Number(payment.amountMinor),
      currency: 'AOA',
      createdAt: payment.createdAt.toISOString(),
    }));
  }
}
