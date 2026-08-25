import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config.js';
import { createPaymentSchema } from './domain/payment.js';
import type { PaymentService } from './services/payment-service.js';
import { verifyHmacSha256 } from './security/webhook-signature.js';
import { dashboardHtml, dashboardScript } from './dashboard.js';
import type { ShopifyOauthService } from './services/shopify-oauth-service.js';
import { newOauthState, normalizeShop, verifyShopifyHmac } from './security/shopify-auth.js';

export function buildApp(config: Config, service: PaymentService, oauth?: ShopifyOauthService) {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.x-appypay-signature'] } });
  app.register(helmet);
  app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  app.get('/health/live', async () => ({ status: 'UP' }));
  app.get('/health/ready', async () => ({ status: 'UP', appyPayMode: config.APPYPAY_MODE }));
  app.get('/auth/shopify', async (request, reply) => {
    if (!config.SHOPIFY_AUTH_ENABLED || !oauth) return reply.code(503).send({ code:'SHOPIFY_AUTH_NOT_CONFIGURED' });
    const shop = normalizeShop(String((request.query as {shop?:string}).shop ?? '')), state = newOauthState();
    reply.header('set-cookie', `shopify_oauth_state=${state}; Path=/auth/shopify/callback; HttpOnly; SameSite=Lax; Max-Age=600${config.NODE_ENV === 'production' ? '; Secure' : ''}`);
    return reply.redirect(oauth.authorizationUrl(shop, state));
  });
  app.get('/auth/shopify/callback', async (request, reply) => {
    if (!config.SHOPIFY_AUTH_ENABLED || !oauth) return reply.code(503).send({ code:'SHOPIFY_AUTH_NOT_CONFIGURED' });
    const query=request.query as Record<string,unknown>, cookie=request.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('shopify_oauth_state='))?.split('=')[1];
    if (!verifyShopifyHmac(query, config.SHOPIFY_API_SECRET!) || typeof query.state !== 'string' || !cookie || query.state !== cookie) return reply.code(401).send({ code:'INVALID_OAUTH_CALLBACK' });
    if (typeof query.shop !== 'string' || typeof query.code !== 'string') return reply.code(400).send({ code:'INVALID_OAUTH_PARAMETERS' });
    await oauth.exchangeCode(query.shop, query.code);
    reply.header('set-cookie','shopify_oauth_state=; Path=/auth/shopify/callback; HttpOnly; SameSite=Lax; Max-Age=0');
    return reply.redirect('/dashboard');
  });
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
