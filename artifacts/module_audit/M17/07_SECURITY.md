# M17 — Security Posture

Reference: [security.md](file:///Users/ivan/Code/work/trading/titan/docs/security.md)

## Threat Model Summary (top threats for this module)
1. **Secret exposure** — Hardcoded passwords in `nats.conf` and `docker-compose.yml` could be committed/exposed
2. **Unauthorized deployment** — Compromised SSH key or GitHub token could trigger malicious deploy
3. **NATS ACL bypass** — Misconfigured permissions could allow service to publish/subscribe to unauthorized subjects
4. **Supply chain attack** — Unpinned GitHub Actions or Docker images could be hijacked

## NATS ACL Boundaries
- Service identity: 8 accounts (`brain`, `execution`, `scavenger`, `hunter`, `sentinel`, `powerlaw`, `quant`, `console`) + 1 system (`sys`)
- Trust zone: Per-service publish/subscribe restrictions in `config/nats.conf`
- `console` is read-only: subscribe to `titan.data.>`, `titan.evt.>` only

## HMAC Signing Coverage
| Boundary | What is Signed | Verification Point |
|----------|----------------|-------------------|
| Release manifest | `digests.json` (image digests) | `provenance.ts sign` in deploy-prod.yml |
| Command signals | NATS messages | Brain verifies HMAC on inbound commands |

## Secrets Handling
| Secret | Storage | Rotation Policy | Fail-Closed? |
|--------|---------|----------------|--------------|
| `POSTGRES_PASSWORD` | `.env` / Docker Secrets (`docker-compose.secrets.yml`) | Manual | Yes |
| `HMAC_SECRET` | `.env` / Docker Secrets | Manual | Yes — `boot_prod_like.sh` asserts |
| `BINANCE_API_KEY/SECRET` | Docker Secrets | Manual | Yes |
| `BYBIT_API_KEY/SECRET` | Docker Secrets | Manual | Yes |
| `GEMINI_API_KEY` | Docker Secrets | Manual | Yes |
| `GRAFANA_ADMIN_PASSWORD` | Docker Secrets | Manual | No — defaults to `admin` in base compose |
| `TITAN_RELEASE_KEY` | GitHub Actions secret | Manual | Yes |
| NATS passwords | Hardcoded in `nats.conf` (dev defaults) | Template-based for prod | No — dev defaults in file |

## Supply Chain Controls
- GitHub Actions pinned to SHA in `ci.yml` and `deploy-prod.yml` ✅
- `npm audit` + `cargo audit` in CI (`security-scan` job) ✅
- SBOM generation via `anchore/sbom-action` in nightly security job ✅
- Docker images built from source (no third-party app images except base OS)

## Exchange Credential Isolation
| Control | Mechanism |
|---------|-----------|
| API key scope | Trade-only (no withdrawal) |
| IP whitelist | Production VPS IPs only |
| Key storage | Docker Secrets files (not env vars) when using `docker-compose.secrets.yml` |
| Verification | `infra/cron/titan-backups.cron` → daily exchange whitelist check |
