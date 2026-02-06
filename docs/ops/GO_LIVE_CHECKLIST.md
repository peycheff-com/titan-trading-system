# Titan Production Go-Live Checklist

**Purpose**: Systematic verification before and after arming the production system.

---

## Pre-Deployment Checklist

### Infrastructure
- [ ] Droplet created with correct specs (s-4vcpu-8gb, AMS3)
- [ ] Cloud Firewall active (only 22/80/443 exposed)
- [ ] SSH key authentication working
- [ ] Host bootstrap complete (Docker, UFW, fail2ban)

### Configuration
- [ ] DNS A record created for titan.peycheff.com
- [ ] DNS propagated (dig returns correct IP)
- [ ] .env.prod populated with production secrets
- [ ] No __CHANGE_ME__ placeholders remaining
- [ ] TITAN_MODE=DISARMED in .env.prod

### CI/CD
- [ ] GitHub secrets updated:
  - [ ] PROD_SSH_HOST
  - [ ] PROD_SSH_USER
  - [ ] PROD_SSH_KEY
  - [ ] TITAN_RELEASE_KEY

---

## Post-Deployment Verification

Run: `./scripts/ops/do/04_verify.sh`

### Network
- [ ] DNS resolves titan.peycheff.com to Droplet IP
- [ ] TLS certificate valid (Let's Encrypt)
- [ ] HTTP redirects to HTTPS
- [ ] Console UI accessible at https://titan.peycheff.com/

### Port Audit (External)
```bash
nmap -Pn -p 22,80,443,3000,5432,6379,9090 <DROPLET_IP>
```
- [ ] Port 22 (SSH): OPEN
- [ ] Port 80 (HTTP): OPEN
- [ ] Port 443 (HTTPS): OPEN
- [ ] Port 3000 (Grafana): FILTERED/CLOSED
- [ ] Port 5432 (Postgres): FILTERED/CLOSED
- [ ] Port 6379 (Redis): FILTERED/CLOSED
- [ ] Port 9090 (Prometheus): FILTERED/CLOSED

### Services
- [ ] All containers running: `docker ps`
- [ ] titan-brain health: OK
- [ ] titan-execution health: OK
- [ ] titan-nats health: OK
- [ ] titan-postgres ready: OK
- [ ] titan-redis ping: PONG

### Safety
- [ ] TITAN_MODE shows DISARMED in Brain logs
- [ ] No secrets visible in docker logs

---

## Arming Procedure (DANGER)

> [!CAUTION]
> Only proceed if ALL checklist items above are verified.

### Step 1: Final Verification
```bash
./scripts/ops/do/04_verify.sh
# All checks must pass
```

### Step 2: Review Risk Policy
- Confirm risk limits are correctly configured
- Confirm exchange API keys have appropriate permissions
- Confirm trading budget limits are set

### Step 3: Arm System
```bash
# Edit environment
sudo nano /opt/titan/compose/.env.prod

# Change: TITAN_MODE=DISARMED
# To:     TITAN_MODE=ARMED

# Restart Brain to apply
docker restart titan-brain

# Verify mode change
docker logs titan-brain 2>&1 | grep "TITAN_MODE"
```

### Step 4: Monitor First Hour
- Watch logs for errors: `docker logs -f titan-brain`
- Monitor execution: `docker logs -f titan-execution`
- Check for unexpected trades
- Verify risk limits are enforced

---

## Disarming (Return to Safe Mode)

```bash
# Method 1: Via Environment
sudo sed -i 's/TITAN_MODE=ARMED/TITAN_MODE=DISARMED/' /opt/titan/compose/.env.prod
docker restart titan-brain

# Method 2: Via NATS Command
docker exec titan-nats nats pub titan.cmd.sys.halt \
  '{"state":"HARD_HALT","reason":"Manual disarm","timestamp":'$(date +%s)'}'
```

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Operator | | | |
| Reviewer | | | |
