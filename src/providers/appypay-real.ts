import { z } from 'zod';
import type { Config } from '../config.js';
import type {
  CreatePayment,
  PaymentResult,
  PaymentStatus,
} from '../domain/payment.js';
import type {
  AppyPayProvider,
  AppyPayWebhookEvent,
} from './appypay.js';

const tokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.union([z.string(), z.number()]),
});

const referenceSchema = z.object({
  referenceNumber: z.string(),
  dueDate: z.string(),
  entity: z.string(),
});

const chargeResponseSchema = z.object({
  id: z.string(),
  responseStatus: z.object({
    successful: z.boolean(),
    status: z.string().nullable().optional(),
    code: z.number().nullable().optional(),
    message: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
  }),
  reference: referenceSchema.nullable().optional(),
  gpo: z.unknown().nullable().optional(),
});

const chargeLookupSchema = z.object({
  payment: z.object({
    id: z.string(),
    status: z.string(),
    reference: referenceSchema.nullable().optional(),
  }),
});

const webhookSchema = z.object({
  id: z.string(),
  merchantTransactionId: z.string().optional(),
  responseStatus: z.object({
    successful: z.boolean().optional(),
    status: z.string().nullable().optional(),
    code: z.number().nullable().optional(),
    source: z.string().nullable().optional(),
  }),
});

function mapStatus(
  status: string | null | undefined,
): PaymentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'success':
      return 'PAID';

    case 'pending':
      return 'PENDING';

    case 'failed':
    case 'failure':
      return 'FAILED';

    case 'expired':
      return 'EXPIRED';

    case 'cancelled':
    case 'canceled':
      return 'CANCELLED';

    case 'refunded':
      return 'REFUNDED';

    default:
      return 'PENDING';
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

export class RealAppyPayProvider
  implements AppyPayProvider
{
  private token?: {
    value: string;
    expiresAt: number;
  };

  constructor(
    private readonly config: Config,
  ) {}

  private resource(): string {
    if (this.config.APPYPAY_MODE === 'sandbox') {
      return this.config.APPYPAY_RESOURCE_TEST!;
    }

    return this.config.APPYPAY_RESOURCE_PRODUCTION!;
  }

  private async accessToken(): Promise<string> {
    if (
      this.token &&
      Date.now() < this.token.expiresAt
    ) {
      return this.token.value;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.APPYPAY_CLIENT_ID!,
      client_secret:
        this.config.APPYPAY_CLIENT_SECRET!,
      resource: this.resource(),
    });

    const response = await fetch(
      this.config.APPYPAY_TOKEN_URL!,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    const raw = await response.json();

    if (!response.ok) {
      throw new Error(
        `APPYPAY_AUTH_FAILED:${response.status}:${JSON.stringify(raw)}`,
      );
    }

    const parsed = tokenSchema.parse(raw);
    const expiresIn = Number(parsed.expires_in);

    this.token = {
      value: parsed.access_token,
      expiresAt:
        Date.now() +
        Math.max(expiresIn - 60, 60) * 1000,
    };

    return parsed.access_token;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    parser: z.ZodType<T>,
  ): Promise<T> {
    const token = await this.accessToken();

    const response = await fetch(
      `${this.config.APPYPAY_BASE_URL}${path}`,
      {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
      },
    );

    const raw = await response.json();

    if (!response.ok) {
      throw new Error(
        `APPYPAY_REQUEST_FAILED:${response.status}:${JSON.stringify(raw)}`,
      );
    }

    return parser.parse(raw);
  }

  private async waitForReference(
    providerPaymentId: string,
  ): Promise<PaymentResult | null> {
    const maxAttempts = 8;
    const delayMs = 750;

    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt += 1
    ) {
      await sleep(delayMs);

      const payment =
        await this.getPayment(providerPaymentId);

      if (payment.reference) {
        return payment;
      }

      if (
        payment.status === 'FAILED' ||
        payment.status === 'EXPIRED' ||
        payment.status === 'CANCELLED'
      ) {
        return payment;
      }
    }

    return null;
  }

  async createPayment(
    input: CreatePayment,
  ): Promise<PaymentResult> {
    const merchantTransactionId =
      input.shopifySessionId
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 15);

    if (!merchantTransactionId) {
      throw new Error(
        'INVALID_MERCHANT_TRANSACTION_ID',
      );
    }

    const payload: Record<string, unknown> = {
      amount: input.amountMinor / 100,
      currency: input.currency,
      description: `Shopify ${input.merchantId}`.slice(
        0,
        100,
      ),
      merchantTransactionId,
      paymentMethod:
        input.method === 'REFERENCE'
          ? this.config.APPYPAY_REF_PAYMENT_METHOD
          : this.config.APPYPAY_GPO_PAYMENT_METHOD,
    };

    if (
      input.method === 'MULTICAIXA_EXPRESS'
    ) {
      payload.paymentInfo = {
        phoneNumber:
          input.customer.phone.replace(/^\+/, ''),
      };
    }

    const parsed = await this.request(
      '/charges',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      chargeResponseSchema,
    );

    const result: PaymentResult = {
      providerPaymentId: parsed.id,
      status: mapStatus(
        parsed.responseStatus.status,
      ),
    };

    if (parsed.reference) {
      result.reference =
        parsed.reference.referenceNumber;
      result.expiresAt =
        parsed.reference.dueDate;

      return result;
    }

    if (input.method === 'REFERENCE') {
      const completed =
        await this.waitForReference(parsed.id);

      if (completed) {
        return completed;
      }
    }

    return result;
  }

  async getPayment(
    providerPaymentId: string,
  ): Promise<PaymentResult> {
    const parsed = await this.request(
      `/charges/${encodeURIComponent(
        providerPaymentId,
      )}`,
      {
        method: 'GET',
      },
      chargeLookupSchema,
    );

    const result: PaymentResult = {
      providerPaymentId:
        parsed.payment.id,
      status: mapStatus(
        parsed.payment.status,
      ),
    };

    if (parsed.payment.reference) {
      result.reference =
        parsed.payment.reference.referenceNumber;
      result.expiresAt =
        parsed.payment.reference.dueDate;
    }

    return result;
  }

  parseWebhook(
    payload: unknown,
  ): AppyPayWebhookEvent {
    const event = webhookSchema.parse(payload);

    return {
      id: `${event.id}:${
        event.responseStatus.code ?? 'status'
      }:${
        event.responseStatus.status ??
        'unknown'
      }`,
      paymentId: event.id,
      status: mapStatus(
        event.responseStatus.status,
      ),
      occurredAt: new Date().toISOString(),
      raw: payload,
    };
  }
}
