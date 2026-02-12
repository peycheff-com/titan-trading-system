# M13 — Failure Modes and Blast Radius

> **Rule**: If you cannot describe recovery deterministically, you do not own the module.
> **Trading context**: Every failure mode must state financial impact.

| # | Failure Mode | Trigger | Detection Signal | Auto Containment | Manual Runbook | Fund Risk? | Recovery Steps | RTO | RPO |
|---|-------------|---------|-----------------|-----------------|----------------|-----------|----------------|-----|-----|
| 1 | OpsD crashes | Unhandled exception / NATS disconnect | Process exits, no heartbeat | PM2/Docker restart policy | Check logs, restart container | No (ops-only) | Auto-restart via Docker | <30s | N/A |
| 2 | Docker socket unavailable | Host Docker daemon down | `spawn` error on `docker` command | Receipt with FAILURE status | Restart Docker daemon on host | No | `systemctl restart docker` | <2m | N/A |
| 3 | HMAC key mismatch | `OPS_SECRET` changed on one side | HMAC verification fails, FAILURE receipts | Command rejected, receipt sent | Sync `OPS_SECRET` across services | No | Redeploy with correct secret | <5m | N/A |
| 4 | Malicious deploy target | Attacker crafts command with arbitrary service name | No detection (missing allowlist) | ⚠️ NONE | Audit NATS messages | No (Docker compose scope) | Add allowlist to `handleDeploy()` | N/A | N/A |
| 5 | NATS connection lost | Network partition / NATS restart | No commands received | NATS reconnect (built into client) | Verify NATS health | Indirect (no ops capability) | Automatic reconnect | <10s | N/A |
| 6 | Emergency halt fails | Docker compose stop hangs | Receipt never published | Timeout monitoring needed | Manual `docker stop` on host | Yes (trading continues) | SSH to host, manual stop | <5m | N/A |
