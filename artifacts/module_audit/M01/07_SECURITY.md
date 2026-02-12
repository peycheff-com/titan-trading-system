# M01 — Security

## Authentication
- **HMAC Verification**: `x-signature` header required for `/signal` and sensitive endpoints (if enabled). relies on shared secret.
- **Admin Routes**: Protected via `AuthMiddleware` (checking specific headers/tokens).

## Authorization
- **Role Based**: Operators have `ARM`/`DISARM`/`OVERRIDE` capabilities.
- **Governance**: `ProposalGateway` verifies cryptographic signatures for policy changes.

## Network
- **CORS**: Configurable origins.
- **Internal Only**: Admin endpoints should be firewalled (not enforced by code, but by infra).

## Secrets
- Loaded via `dotenv` and `@titan/shared` secret loader.
- **Critical Secrets**: `HMAC_SECRET`, `DB_PASSWORD`, `NATS_PASS`, `GOVERNANCE_KEYS`.
