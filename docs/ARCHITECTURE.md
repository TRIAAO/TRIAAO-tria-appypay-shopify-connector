# Architecture

The connector is split into four boundaries: Shopify Payment Extension, connector API, AppyPay provider adapter, and durable storage. The extension remains disabled until Shopify grants restricted Payments Apps API access.

## Current phase

- Mock AppyPay provider for deterministic UAT development.
- AOA-only transactions.
- MULTICAIXA Express and Reference domain models.
- HMAC webhook verification, event deduplication and charge idempotency.
- PostgreSQL is the runtime source of truth and migrations run automatically at container startup.

## Approval-dependent work

- Shopify Payment Extension and restricted scopes.
- Official AppyPay request/response mapping.
- Production webhook signature specification.
- Refund, void and reconciliation contracts.

No theme script or checkout bypass is part of this architecture.
