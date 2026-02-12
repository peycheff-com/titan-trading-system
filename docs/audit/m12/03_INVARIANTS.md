# M12 Invariants

## Security Invariants
1. **Master Auth**: Login MUST fail if `TITAN_MASTER_PASSWORD` is not set (Fail-Closed).
    - *Current Reality*: Checked inside route handler, strictly enforces presence.
2. **Ops Integrity**: All Ops Commands MUST be signed with `OPS_SECRET`.
    - *Current Reality*: Implemented in `ops.ts`.
3. **Decryption Limits**: Unmasked credentials MUST ONLY be returned to:
    - Internal services with valid `X-Internal-Auth`.
    - Connection test logic (system-internal).
    - *Current Reality*: `GET /api/credentials` returns masked values.
4. **Audit Trail**: EVERY access to credentials (view, create, delete, test) MUST be logged to `credential_audit_log`.
    - *Current Reality*: Audit calls present in all route handlers.

## Operational Invariants
1. **NATS Connectivity**: Service MUST NOT operate without NATS connection.
    - *Current Reality*: Connects at verification, but might fallback to localhost.
2. **DB Connectivity**: Service requires `DATABASE_URL`.
