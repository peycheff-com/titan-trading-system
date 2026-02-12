# M13 — Security Posture

Reference: [security.md](file:///Users/ivan/Code/work/trading/titan/docs/security.md)

## Threat Model Summary (top threats for this module)
1. **Command injection via deploy target** — `handleDeploy()` passes `cmd.target` to `docker compose` without allowlist validation. Mitigated by HMAC (only Console API can sign commands), but defense-in-depth requires allowlist. **REMEDIATED**: Added allowlist to `handleDeploy()`.
2. **HMAC key exfiltration** — If `OPS_SECRET` leaks, attacker can forge commands. Mitigated by Docker secret mount in production.
3. **Docker socket abuse** — Container has full Docker access. Mitigated by NATS ACL (only trusted publishers) + HMAC.

## NATS ACL Boundaries
- Service identity: `titan-opsd`
- Trust zone: **Subscribe-only** on `titan.ops.command.v1`, **Publish** on `titan.ops.receipt.v1`

## HMAC Signing Coverage
| Boundary | What is Signed | Verification Point |
|----------|----------------|-------------------|
| Console API → OpsD | Full `OpsCommandV1` (minus `meta.signature`) | `verifyOpsCommand()` with `crypto.timingSafeEqual` |

## Secrets Handling
| Secret | Storage | Rotation Policy | Fail-Closed? |
|--------|---------|----------------|--------------|
| `OPS_SECRET` | `.env` / Docker secret mount | Manual rotation | **Yes** — `process.exit(1)` if missing |

## Supply Chain Controls
- `npm audit` in CI
- Minimal dependencies: `@titan/shared`, `dotenv`, `uuid`
- Docker image: `node:22-alpine` (minimal attack surface)

## Exchange Credential Isolation
| Control | Mechanism |
|---------|-----------| 
| N/A | OpsD does not hold exchange credentials |
