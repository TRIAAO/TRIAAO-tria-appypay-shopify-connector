import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { MockAppyPayProvider } from './providers/appypay-mock.js';
import { PaymentService } from './services/payment-service.js';
import { InMemoryPaymentStore } from './stores/in-memory-payment-store.js';

const config = loadConfig();
if (config.APPYPAY_MODE !== 'mock') throw new Error('Real AppyPay adapter is pending official API documentation');
const app = buildApp(config, new PaymentService(new MockAppyPayProvider(), new InMemoryPaymentStore()));
await app.listen({ port: config.PORT, host: config.HOST });
