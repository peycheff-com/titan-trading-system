# Secrets Management

## Strategy

- **Local development**: `.env` files (never commit real secrets).
- **Production**: Docker secrets or a dedicated secrets manager (Vault/KMS).
- Services support `*_FILE` environment variables to read secrets from mounted files.

## Docker Secrets (Recommended for Single-Host VPS)

1. Create secret files under `./secrets/` (not committed):

```
secrets/
  titan_db_password
  titan_hmac_secret
  binance_api_key
  binance_api_secret
  bybit_api_key
  bybit_api_secret
  gemini_api_key
  grafana_admin_password
```

2. Deploy with the secrets overlay:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.secrets.yml up -d
```

3. Services will load the `*_FILE` values into environment variables at runtime.

## Vault / KMS (Recommended for Multi-Node)

- Use Vault Agent or KMS sidecar to render secrets to files.
- Mount rendered files to the containers and set `*_FILE` variables.
- Rotate secrets centrally and reload services on rotation.

## Rotation Policy

- Rotate exchange API keys and HMAC secrets every 30-90 days.
- Rotate database credentials quarterly or after any incident.
- Audit all rotations and update access policies.

## Enforcement Guidelines

- `.env` files are for local use only.
- Production secrets must not exist in git history.
- File permissions should be `600` and owned by the deploy user.
