# Titan Production Checklist

## Security Pre-Flight
- [x] `TITAN_MASTER_PASSWORD` is set and complex (min 32 chars).
- [x] `JWT_SECRET` is rotated and secure.
- [x] `HMAC_SECRET` is consistent across opsd, brain, and console-api.
- [x] Network: Only Docker socket is mounted to OpsD (and it's root).
- [x] Firewall: Ports 80/443 (Traefik) are open. 3100 (Brain) is now internal-only. NATS binds to Localhost/VPC.

## Deployment
- [x] `docker-compose.prod.yml` is the single source of truth.
- [x] All images are pinned to SHA or specific tags in production (avoid generic `latest` if possible).
- [x] SSL Certificates (LetsEncrypt) are valid (Configured in Traefik).

## Application Health
- [x] Console UI loads at `https://titan.peycheff.com`
- [x] Login works with `TITAN_MASTER_PASSWORD` (Verified in Drills).
- [x] Dashboard shows 'Connected' state (Verified in Drills).
- [x] 'Live Ops' stream is active (heartbeats visible).
- [x] 'Export Evidence' triggers a download (Endpoint Verified).

## Operations
- [x] Restarting 'Brain' from Console works (Handler Verified).
- [x] Logs are draining to Loki/Prometheus (if configured) (Standard Docker Logging Active).
- [x] Backups for Postgres (`titan_brain`) are scheduled (via `scripts/backup-db.sh` + cron).
