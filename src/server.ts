import { buildApp } from './app.js';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from './config.js';
import { MockAppyPayProvider } from './providers/appypay-mock.js';
import { RealAppyPayProvider } from './providers/appypay-real.js';
import type { AppyPayProvider } from './providers/appypay.js';
import { PaymentService } from './services/payment-service.js';
import { PrismaPaymentStore } from './stores/prisma-payment-store.js';
import { ShopifyOauthService } from './services/shopify-oauth-service.js';

const config = loadConfig();

const prisma = new PrismaClient();
await prisma.$connect();

const provider: AppyPayProvider =
  config.APPYPAY_MODE === 'mock'
    ? new MockAppyPayProvider()
    : new RealAppyPayProvider(config);

const oauth = config.SHOPIFY_AUTH_ENABLED
  ? new ShopifyOauthService(config, prisma)
  : undefined;

const service = new PaymentService(
  provider,
  new PrismaPaymentStore(prisma),
);

const app = buildApp(
  config,
  service,
  oauth,
);

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({
  port: config.PORT,
  host: config.HOST,
});
