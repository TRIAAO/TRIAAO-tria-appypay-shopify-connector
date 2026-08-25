import { describe, expect, it } from 'vitest';
import { MockAppyPayProvider } from '../src/providers/appypay-mock.js';
import { PaymentService } from '../src/services/payment-service.js';
import { InMemoryPaymentStore } from '../src/stores/in-memory-payment-store.js';

const input = { merchantId:'spaccio', shopifySessionId:'shopify-1', idempotencyKey:'idem-key-123', method:'REFERENCE' as const, amountMinor:150000, currency:'AOA' as const, customer:{name:'Cliente Teste',phone:'+244900000000'}, returnUrl:'https://example.test/return' };
describe('PaymentService', () => {
  it('does not create duplicate charges', async () => {
    const provider = new MockAppyPayProvider(); const service = new PaymentService(provider, new InMemoryPaymentStore());
    const first = await service.create(input); const second = await service.create(input);
    expect(second.providerPaymentId).toBe(first.providerPaymentId); expect(provider.payments.size).toBe(1);
  });
  it('deduplicates webhook events', async () => {
    const service = new PaymentService(new MockAppyPayProvider(), new InMemoryPaymentStore()); await service.create(input);
    const event = {id:'evt-1',paymentId:(await service.create(input)).providerPaymentId,status:'PAID',occurredAt:new Date().toISOString()};
    expect((await service.processWebhook(event)).duplicate).toBe(false); expect((await service.processWebhook(event)).duplicate).toBe(true);
  });
});
