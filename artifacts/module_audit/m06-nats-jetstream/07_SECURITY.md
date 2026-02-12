# Security: M06 NATS JetStream

## 1. Authentication & Authorization
- **Mechanism**: Token/User + Password (via Environment Variables).
- **Accounts**:
    - `TITAN`: Main account.
    - `sys`: System admin.
- **Users**: Explicit users for each service (`brain`, `execution`, `scavenger`, etc.).
- **Secrets Management**: Passwords injected into `nats.conf` via `nats-entrypoint.sh` from environment variables. No hardcoded secrets in version control.

## 2. Access Control Lists (ACLs)
Defined in `config/nats.conf`.

| User | Publish | Subscribe | Risk Level |
|------|---------|-----------|------------|
| `brain` | `*`, `$JS.API.>` | `*`, `_INBOX.>` | Critical |
| `execution` | `titan.evt.execution.fill.v1`, `titan.execution.>` | `titan.cmd.execution.place.v1.>`, `titan.cmd.risk.>` | Critical |
| `scavenger` | `titan.evt.scavenger.signal.v1` | `titan.evt.budget.update.v1` | High |
| `console` | `$JS.API.>` (KV) | `titan.data.>`, `titan.evt.>` | Low (Read-Only) |

## 3. Network Security
- **Port 4222**: Client connections. Should be internal only (private VPC).
- **Port 8222**: Monitoring. Should be restricted or not exposed publicly.
- **TLS**: Currently NOT explicitly configured in `nats.conf` (assumes private network or sidecar encryption). **Audit Gap**.

## 4. Encryption
- **At Rest**: JetStream files are NOT encrypted at rest by NATS. Relies on disk encryption (e.g., EBS encryption).
- **In Transit**: TLS not enabled in `nats.conf`.

## 5. Message Integrity
- **Signing**: `NatsClient.ts` supports HMAC signing of envelopes (`titan.cmd.exec` etc.).
- **Verification**: `execution` service verifies HMAC signatures on intents.
