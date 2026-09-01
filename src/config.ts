import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  APP_BASE_URL: z.string().url(),

  APPYPAY_MODE: z.enum(['mock', 'sandbox', 'production']).default('mock'),
  APPYPAY_BASE_URL: z.string().url().optional().or(z.literal('')),
  APPYPAY_API_KEY: z.string().optional(),

  APPYPAY_CLIENT_ID: z.string().optional(),
  APPYPAY_CLIENT_SECRET: z.string().optional(),
  APPYPAY_RESOURCE_TEST: z.string().optional(),
  APPYPAY_RESOURCE_PRODUCTION: z.string().optional(),
  APPYPAY_TOKEN_URL: z.string().url().optional(),
  APPYPAY_REF_PAYMENT_METHOD: z.string().optional(),
  APPYPAY_GPO_PAYMENT_METHOD: z.string().optional(),

  APPYPAY_WEBHOOK_SECRET: z.string().min(32),

  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_API_SECRET: z.string().optional(),
  SHOPIFY_SCOPES: z.string().optional(),
  SHOPIFY_AUTH_ENABLED: z.string().default('false').transform(value => value === 'true'),
  APP_ENCRYPTION_KEY: z.string().optional(),
  DASHBOARD_ENABLED: z.string().default('false').transform(value => value === 'true'),
}).superRefine((value, ctx) => {
  if (
    value.SHOPIFY_AUTH_ENABLED &&
    (!value.SHOPIFY_API_KEY || !value.SHOPIFY_API_SECRET || !value.APP_ENCRYPTION_KEY)
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'Shopify auth requires API key, API secret and encryption key',
    });
  }

  if (
    value.SHOPIFY_AUTH_ENABLED &&
    Buffer.from(value.APP_ENCRYPTION_KEY ?? '', 'base64').length !== 32
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    });
  }

  if (value.APPYPAY_MODE !== 'mock') {
    const required = [
      ['APPYPAY_BASE_URL', value.APPYPAY_BASE_URL],
      ['APPYPAY_CLIENT_ID', value.APPYPAY_CLIENT_ID],
      ['APPYPAY_CLIENT_SECRET', value.APPYPAY_CLIENT_SECRET],
      ['APPYPAY_TOKEN_URL', value.APPYPAY_TOKEN_URL],
      ['APPYPAY_REF_PAYMENT_METHOD', value.APPYPAY_REF_PAYMENT_METHOD],
      ['APPYPAY_GPO_PAYMENT_METHOD', value.APPYPAY_GPO_PAYMENT_METHOD],
    ] as const;

    for (const [name, current] of required) {
      if (!current) {
        ctx.addIssue({
          code: 'custom',
          message: `${name} is required for real AppyPay mode`,
        });
      }
    }

    if (value.APPYPAY_MODE === 'sandbox' && !value.APPYPAY_RESOURCE_TEST) {
      ctx.addIssue({
        code: 'custom',
        message: 'APPYPAY_RESOURCE_TEST is required for sandbox mode',
      });
    }

    if (value.APPYPAY_MODE === 'production' && !value.APPYPAY_RESOURCE_PRODUCTION) {
      ctx.addIssue({
        code: 'custom',
        message: 'APPYPAY_RESOURCE_PRODUCTION is required for production mode',
      });
    }
  }
});

export type Config = z.infer<typeof schema>;

export const loadConfig = (
  env: NodeJS.ProcessEnv = process.env,
): Config => schema.parse(env);
