# Titan Production Checklist

## Security Pre-Flight
- [ ] `TITAN_MASTER_PASSWORD` is set and complex (min 32 chars).
- [ ] `JWT_SECRET` is rotated and secure.
- [ ] `HMAC_SECRET` is consistent across opsd, brain, and console-api.
- [x] Network: Only Docker socket is mounted to OpsD (and it's root).
- [x] Firewall: Ports 80/443 (Traefik) are open. 3100 (Brain) is now internal-only. NATS binds to Localhost/VPC.

## Deployment
- [x] `docker-compose.prod.yml` is the single source of truth.
- [x] All images are pinned to SHA or specific tags in production (avoid generic `latest` if possible).
- [ ] SSL Certificates (LetsEncrypt) are valid.

## Application Health
- [ ] Console UI loads at `https://titan.peycheff.com`
- [ ] Login works with `TITAN_MASTER_PASSWORD`.
- [ ] Dashboard shows 'Connected' state.
- [ ] 'Live Ops' stream is active (heartbeats visible).
- [ ] 'Export Evidence' triggers a download.

## Operations
- [ ] Restarting 'Brain' from Console works.
- [ ] Logs are draining to Loki/Prometheus (if configured).
- [x] Backups for Postgres (`titan_brain`) are scheduled (via `scripts/backup-db.sh` + cron).
