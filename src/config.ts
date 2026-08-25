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
  APPYPAY_WEBHOOK_SECRET: z.string().min(32),
  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_API_SECRET: z.string().optional(),
  SHOPIFY_SCOPES: z.string().optional(),
});

export type Config = z.infer<typeof schema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => schema.parse(env);
