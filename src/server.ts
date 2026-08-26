import { buildApp } from './app.js';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from './config.js';
import { MockAppyPayProvider } from './providers/appypay-mock.js';
import { PaymentService } from './services/payment-service.js';
import { PrismaPaymentStore } from './stores/prisma-payment-store.js';
import { ShopifyOauthService } from './services/shopify-oauth-service.js';

const config = loadConfig();
if (config.APPYPAY_MODE !== 'mock') throw new Error('Real AppyPay adapter is pending official API documentation');
const prisma = new PrismaClient();
await prisma.$connect();
const oauth = config.SHOPIFY_AUTH_ENABLED ? new ShopifyOauthService(config, prisma) : undefined;
const app = buildApp(config, new PaymentService(new MockAppyPayProvider(), new PrismaPaymentStore(prisma)), oauth);
const shutdown = async () => { await app.close(); await prisma.$disconnect(); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
await app.listen({ port: config.PORT, host: config.HOST });
