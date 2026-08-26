import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { CreatePayment, PaymentResult, PaymentStatus } from '../domain/payment.js';
import type { AppyPayProvider, AppyPayWebhookEvent } from './appypay.js';

const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.coerce.number().positive().default(3600) });
const statusSchema = z.object({
  successful: z.boolean(),
  status: z.enum(['Requested', 'Pending', 'Success', 'Failed']),
  code: z.number(),
  message: z.string(),
  source: z.string(),
  sourceDetails: z.unknown().optional(),
});
const referenceSchema = z.object({ referenceNumber: z.string(), dueDate: z.string().optional() }).passthrough();
const chargeSchema = z.object({ id: z.string().min(1), responseStatus: statusSchema, reference: referenceSchema.nullish() }).passthrough();
const getChargeSchema = z.object({
  payment: z.object({ id:z.string().min(1), status:z.enum(['Requested','Pending','Success','Failed']), reference:referenceSchema.nullish() }).passthrough()
});
const webhookSchema = z.object({
  id: z.string().min(1),
  merchantTransactionId: z.string().min(1),
  amount: z.number().positive(),
  responseStatus: statusSchema,
}).passthrough();

const mapStatus = (status: 'Requested'|'Pending'|'Success'|'Failed'): PaymentStatus =>
  status === 'Success' ? 'PAID' : status === 'Failed' ? 'FAILED' : 'PENDING';

export class RealAppyPayProvider implements AppyPayProvider {
  private token?: { value:string; expiresAt:number };

  constructor(private readonly config: Config) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const body = new URLSearchParams({
      grant_type:'client_credentials',
      client_id:this.config.APPYPAY_CLIENT_ID!,
      client_secret:this.config.APPYPAY_CLIENT_SECRET!,
      resource:this.config.APPYPAY_RESOURCE!,
    });
    const response = await fetch(this.config.APPYPAY_TOKEN_URL!, {
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body,
      signal:AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`APPYPAY_AUTH_HTTP_${response.status}`);
    const parsed = tokenSchema.parse(await response.json());
    this.token = { value:parsed.access_token, expiresAt:Date.now() + parsed.expires_in * 1000 };
    return parsed.access_token;
  }

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    const response = await fetch(`${this.config.APPYPAY_BASE_URL}${path}`, {
      ...init,
      headers:{
        accept:'application/json',
        'accept-language':'pt-BR',
        authorization:`Bearer ${token}`,
        ...init.headers,
      },
      signal:init.signal ?? AbortSignal.timeout(100_000),
    });
    if (!response.ok) throw new Error(`APPYPAY_HTTP_${response.status}`);
    return response;
  }

  async createPayment(input: CreatePayment): Promise<PaymentResult> {
    const merchantTransactionId = createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0,15).toUpperCase();
    const payload: Record<string, unknown> = {
      amount:input.amountMinor / 100,
      currency:'AOA',
      description:'Shopify payment',
      merchantTransactionId,
      paymentMethod:input.method === 'REFERENCE' ? this.config.APPYPAY_PAYMENT_METHOD_REF : this.config.APPYPAY_PAYMENT_METHOD_GPO,
    };
    if (input.method === 'MULTICAIXA_EXPRESS') payload.paymentInfo = { phoneNumber:input.customer.phone.replace(/\D/g,'') };
    const response = await this.api('/v2.0/charges', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload),
    });
    const charge = chargeSchema.parse(await response.json());
    return {
      providerPaymentId:charge.id,
      status:mapStatus(charge.responseStatus.status),
      ...(charge.reference?.referenceNumber ? {reference:charge.reference.referenceNumber} : {}),
      ...(charge.reference?.dueDate ? {expiresAt:new Date(charge.reference.dueDate).toISOString()} : {}),
    };
  }

  async getPayment(providerPaymentId: string): Promise<PaymentResult> {
    const response = await this.api(`/v2.0/charges/${encodeURIComponent(providerPaymentId)}`, { method:'GET' });
    const { payment } = getChargeSchema.parse(await response.json());
    return {
      providerPaymentId:payment.id,
      status:mapStatus(payment.status),
      ...(payment.reference?.referenceNumber ? {reference:payment.reference.referenceNumber} : {}),
      ...(payment.reference?.dueDate ? {expiresAt:new Date(payment.reference.dueDate).toISOString()} : {}),
    };
  }

  parseWebhook(payload: unknown): AppyPayWebhookEvent {
    const event = webhookSchema.parse(payload);
    const status = mapStatus(event.responseStatus.status);
    return {
      id:`${event.id}:${event.responseStatus.status}:${event.responseStatus.code}`,
      paymentId:event.id,
      status,
      occurredAt:new Date().toISOString(),
      raw:payload,
    };
  }
}
