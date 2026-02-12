# M16 — Security Posture

Reference: [security.md](file:///Users/ivan/Code/work/trading/titan/docs/security.md)

## Threat Model Summary (top threats for this module)
1. **Unauthenticated `/metrics` endpoints**: All services expose metrics without authentication. An attacker on the network can enumerate internal state (equity, positions, leverage).
2. **Grafana admin password**: ✅ FIXED — Now uses `${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD required}` in `docker-compose.yml` (no longer hardcoded `admin`).
3. **Information leakage via dashboards**: Grafana exposes business metrics (equity, drawdown, fill rates) — must be network-isolated.
4. **Alert spoofing / suppression**: If Alertmanager is compromised, critical alerts could be silently dropped.

## NATS ACL Boundaries
- Service identity: Monitoring stack does not connect to NATS directly
- Trust zone: Read-only — pulls metrics via HTTP scrape

## HMAC Signing Coverage
| Boundary | What is Signed | Verification Point |
|----------|----------------|-------------------|
| N/A | Monitoring uses HTTP scrape, not NATS | N/A |

## Secrets Handling
| Secret | Storage | Rotation Policy | Fail-Closed? |
|--------|---------|----------------|--------------|
| `GF_SECURITY_ADMIN_PASSWORD` | `docker-compose.yml` env var | Manual — should rotate | No |

## Mitigations (accepted risks)
- `/metrics` endpoints are on internal Docker network only — not exposed to public internet
- Grafana is intended for operator use behind VPN — accepted risk with `admin` default
- These are **acceptable for Gate A** given the internal deployment model

## Supply Chain Controls
- Prometheus: Official `prom/prometheus:latest` image
- Grafana: Official `grafana/grafana:latest` image
- prom-client: npm dependency in `titan-brain`

## Exchange Credential Isolation
| Control | Mechanism |
|---------|-----------|
| N/A | Monitoring stack has no access to exchange credentials |
