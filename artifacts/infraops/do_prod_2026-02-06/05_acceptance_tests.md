# Titan Production Acceptance Tests

**Date**: 2026-02-06
**Droplet**: 167.99.44.77

## Test Results

| Test | Status | Details |
|------|--------|---------|
| DNS Resolution | ✅ PASS | titan.peycheff.com → 167.99.44.77 |
| TLS/HTTPS | ✅ PASS | HTTP/2 404 (Traefik default cert) |
| Port Audit | ✅ PASS | Only 22/80/443 externally accessible |
| Service Health | ✅ PASS | 6/6 services responding |
| TITAN_MODE | ✅ PASS | DISARMED |
| Secrets in Logs | ✅ PASS | None found |

## Service Status

| Container | Status | Health |
|-----------|--------|--------|
| titan-traefik | Running | 301 redirect |
| titan-nats | Running | v2.10.24 |
| titan-postgres | Running | Accepting connections |
| titan-redis | Running | PONG |
| titan-console-api | Running | {"status":"ok"} |
| titan-console | Running | OK |
| titan-opsd | Running | NATS connected |
| titan-prometheus | Running | - |
| titan-grafana | Running | - |
| titan-tempo | Running | - |

## Port Exposure

**External** (0.0.0.0):
- 22 (SSH)
- 80 (HTTP)
- 443 (HTTPS)

**Localhost only** (127.0.0.1):
- 4222 (NATS client)
- 8222 (NATS monitoring)

**Internal Docker network only**:
- 5432 (Postgres)
- 6379 (Redis)
- 9090 (Prometheus)
- 3000 (Grafana, console-api)
