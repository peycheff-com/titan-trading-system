# Removal/Wipe Report
## Generated: 2026-02-01T23:40:00+02:00

---

## Wipe Summary

| Metric | Before | After |
|--------|--------|-------|
| Containers | 9 running | 0 |
| Images | 21 | 0 |
| Volumes | 12 | 0 |
| Disk Reclaimed | - | **45.92 GB** |
| /opt/titan | Git repo + artifacts | Empty |
| /etc/titan/secrets | N/A | Created (700 perms) |

---

## Containers Removed

| Container | Image | Status Before |
|-----------|-------|---------------|
| titan-brain | titan-titan-brain:latest | Up (health: starting) |
| titan-postgres | postgres:16-alpine | Up 13h (healthy) |
| titan-nats | nats:2.10.24-alpine | Up 6 days (healthy) |
| titan-redis | redis:7.4-alpine | Up 6 days (healthy) |
| titan-ai-quant | titan-titan-ai-quant:latest | Up 6 days (healthy) |
| titan-phase1-scavenger | titan-titan-phase1-scavenger:latest | Up 26min (healthy) |
| titan-powerlaw-lab | titan-titan-powerlaw-lab:latest | Up 6 days (healthy) |
| titan-phase2-hunter | titan-titan-phase2-hunter:latest | Up 4h (**unhealthy**) |
| titan-phase3-sentinel | titan-titan-phase3-sentinel:latest | Up 37min (healthy) |

> [!NOTE]
> `titan-phase2-hunter` was in **unhealthy** state before wipe.

---

## Volumes Removed

- titan_nats_data
- titan_postgres_data
- titan_powerlaw_data
- titan_redis_data
- titan_titan-ai-data
- titan_titan-db-data
- titan_titan-grafana-data
- titan_titan-ipc
- titan_titan-prometheus-data
- titan_titan-redis-data
- titan_titan-tempo-data
- titan_traefik-certs

---

## Verification

### Docker State (Empty)
```
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
DRIVER    VOLUME NAME
IMAGE   ID             DISK USAGE   CONTENT SIZE   EXTRA
```

### Directory State
```
/opt/titan: empty, ready for deployment
/etc/titan/secrets: created with 700 permissions
```

---

## Commands Executed

```bash
# 1. Stop compose stack
docker compose -f docker-compose.prod.yml down -v --remove-orphans

# 2. Force remove remaining containers
docker ps -aq | xargs -r docker rm -f

# 3. Remove remaining volumes
docker volume ls -q | xargs -r docker volume rm -f

# 4. Full system prune
docker system prune -a --volumes -f

# 5. Remove old deployment
rm -rf /opt/titan

# 6. Create fresh directories
mkdir -p /opt/titan /etc/titan/secrets
chmod 700 /etc/titan/secrets
```

---

## Status: ✅ WIPE COMPLETE
