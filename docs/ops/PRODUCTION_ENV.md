# Titan Environment Variables Reference

**Purpose**: Complete documentation of all environment variables used in production.

---

## Core Configuration

| Variable | Purpose | Default | Secret? |
|----------|---------|---------|---------|
| `DOMAIN` | Production domain | `localhost` | No |
| `ACME_EMAIL` | Let's Encrypt contact | `admin@example.com` | No |
| `TITAN_MODE` | System mode (ARMED/DISARMED) | `DISARMED` | No |
| `NODE_ENV` | Node.js environment | `production` | No |
| `RUST_LOG` | Rust logging level | `info` | No |

---

## Database (PostgreSQL)

| Variable | Purpose | Default | Secret? |
|----------|---------|---------|---------|
| `TITAN_DB_HOST` | Database host | `titan-postgres` | No |
| `TITAN_DB_PORT` | Database port | `5432` | No |
| `TITAN_DB_NAME` | Database name | `titan_brain` | No |
| `TITAN_DB_USER` | Database user | `titan` | No |
| `TITAN_DB_PASSWORD` | Database password | - | **Yes** |
| `DATABASE_URL` | Full connection URL | - | **Yes** |

---

## NATS Authentication

| Variable | Purpose | Secret? |
|----------|---------|---------|
| `NATS_URL` | NATS server URL | No |
| `NATS_SYS_PASSWORD` | System user password | **Yes** |
| `NATS_BRAIN_PASSWORD` | Brain service password | **Yes** |
| `NATS_EXECUTION_PASSWORD` | Execution service password | **Yes** |
| `NATS_SCAVENGER_PASSWORD` | Scavenger service password | **Yes** |
| `NATS_HUNTER_PASSWORD` | Hunter service password | **Yes** |
| `NATS_SENTINEL_PASSWORD` | Sentinel service password | **Yes** |
| `NATS_POWERLAW_PASSWORD` | Powerlaw service password | **Yes** |
| `NATS_QUANT_PASSWORD` | Quant service password | **Yes** |
| `NATS_CONSOLE_PASSWORD` | Console service password | **Yes** |

---

## Redis

| Variable | Purpose | Default | Secret? |
|----------|---------|---------|---------|
| `REDIS_URL` | Redis connection URL | `redis://titan-redis:6379` | No |

---

## Security & Authentication

| Variable | Purpose | Secret? |
|----------|---------|---------|
| `TITAN_MASTER_PASSWORD` | Admin password (Grafana, Console) | **Yes** |
| `HMAC_SECRET` | Command signing secret | **Yes** |
| `JWT_SECRET` | JWT token signing | **Yes** |

---

## Exchange Credentials

| Variable | Purpose | Secret? |
|----------|---------|---------|
| `BINANCE_API_KEY` | Binance API key | **Yes** |
| `BINANCE_API_SECRET` | Binance API secret | **Yes** |

---

## Service Ports (Internal)

| Variable | Service | Default |
|----------|---------|---------|
| `BRAIN_PORT` | titan-brain | `3100` |
| `EXECUTION_PORT` | titan-execution | `3002` |
| `CONSOLE_PORT` | titan-console | `8080` |
| `CONSOLE_API_PORT` | titan-console-api | `3000` |

---

## Registry Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `TITAN_REGISTRY` | Docker registry | `ghcr.io/peycheff-com/titan-trading-system` |
| `IMAGE_TAG` | Image tag to deploy | `latest` |

---

## Secret Management Notes

1. **Never commit secrets to Git**
2. **All secrets stored in `/opt/titan/compose/.env.prod`**
3. **File permissions: chmod 600, owned by root**
4. **GitHub Actions secrets for CI/CD only (not runtime secrets)**

### Generating Secrets

```bash
# Generate random password
openssl rand -base64 32

# Generate HMAC secret
openssl rand -hex 32

# Generate JWT secret
openssl rand -base64 64
```
