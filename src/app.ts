import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config.js';
import { createPaymentSchema } from './domain/payment.js';
import type { PaymentService } from './services/payment-service.js';
import { verifyHmacSha256 } from './security/webhook-signature.js';
import { dashboardHtml, dashboardScript } from './dashboard.js';

export function buildApp(config: Config, service: PaymentService) {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.x-appypay-signature'] } });
  app.register(helmet);
  app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  app.get('/health/live', async () => ({ status: 'UP' }));
  app.get('/health/ready', async () => ({ status: 'UP', appyPayMode: config.APPYPAY_MODE }));
  app.get('/dashboard', async (_request, reply) => {
    if (config.NODE_ENV === 'production') return reply.code(404).send({ code: 'NOT_FOUND' });
    return reply.type('text/html; charset=utf-8').send(dashboardHtml);
  });
  app.get('/dashboard.js', async (_request, reply) => {
    if (config.NODE_ENV === 'production') return reply.code(404).send({ code: 'NOT_FOUND' });
    return reply.type('application/javascript; charset=utf-8').send(dashboardScript);
  });
  app.get('/v1/payments', async () => service.listRecent(100));
  app.post('/v1/payments', async (request, reply) => {
    const parsed = createPaymentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: 'INVALID_REQUEST', details: parsed.error.flatten() });
    const payment = await service.create(parsed.data);
    return reply.code(201).send(payment);
  });
  app.post('/v1/webhooks/appypay', { config: { rawBody: true } }, async (request, reply) => {
    const raw = JSON.stringify(request.body ?? {});
    const signature = request.headers['x-appypay-signature'] as string | undefined;
    if (!verifyHmacSha256(raw, signature, config.APPYPAY_WEBHOOK_SECRET)) return reply.code(401).send({ code: 'INVALID_SIGNATURE' });
    const result = await service.processWebhook(request.body);
    return reply.code(200).send({ received: true, duplicate: result.duplicate });
  });
  return app;
}
