# Phase 1: Research Notes

**Date**: 2026-02-06  
**Research Topic**: DigitalOcean Provisioning, SSH Hardening, Traefik ACME

---

## 1. DigitalOcean Droplet Provisioning (Feb 2026)

### Sources
- DigitalOcean Official Docs
- Web search results (Feb 2026)

### Key Recommendations

**Droplet Creation**:
- Use SSH keys only, never password authentication
- SSH keys control root access; named users must be set up separately
- Recommended region: closest to operator (AMS3 for Europe)
- Recommended size: 4GB RAM minimum for our 15-service stack (s-2vcpu-4gb or higher)
- Enable Droplet Metrics Agent for monitoring

**Automation**:
- Use Cloud-Init for initial configuration automation
- Enables bootstrapping scripts to run on first boot
- Idempotent setup for reproducibility

**Networking**:
- Use VPC for network isolation
- Cloud Firewall operates at the network edge (before traffic hits Droplet)

---

## 2. SSH Hardening Best Practices (Feb 2026)

### Configuration (`/etc/ssh/sshd_config`)

```bash
# Disable password authentication
PasswordAuthentication no

# Disable root login
PermitRootLogin no

# Limit to specific users
AllowUsers deploy

# Use only modern protocols
Protocol 2

# Strong key algorithms (ED25519 preferred)
HostKeyAlgorithms ssh-ed25519
```

### Key Management
- Generate ED25519 keys (`ssh-keygen -t ed25519`)
- Always use passphrases for private keys
- Rotate keys every 2 years
- Never share keys between individuals
- Revoke access by removing public keys

### Additional Hardening
- Install `fail2ban` for brute-force protection
- Enable `unattended-upgrades` for security patches
- Limit SSH access to specific IPs in Cloud Firewall

---

## 3. DigitalOcean Cloud Firewall

### Default Policy
- Default-deny: blocks all traffic not explicitly permitted
- Applied at network edge (before reaching Droplet)

### Recommended Rules

**Inbound**:
| Type | Protocol | Port | Source | Notes |
|------|----------|------|--------|-------|
| SSH | TCP | 22 | Operator IP only | Restrict to known IPs |
| HTTP | TCP | 80 | All (0.0.0.0/0) | ACME challenge |
| HTTPS | TCP | 443 | All (0.0.0.0/0) | Production traffic |

**Outbound**:
| Type | Protocol | Port | Destination | Notes |
|------|----------|------|-------------|-------|
| All | TCP | All | All | Allow egress |
| DNS | UDP | 53 | All | DNS resolution |

### Best Practices
- Apply firewalls using tags for fleet management
- Separate from OS-level firewalls (can use both)
- Whitelist by IP, tags, Droplets, or Load Balancers
- Review and update rules regularly

---

## 4. Traefik v3 ACME (Let's Encrypt) Configuration

### Sources
- Official Traefik documentation
- Web search results (Feb 2026)

### HTTP-01 Challenge (Recommended)

```yaml
command:
  - --entrypoints.web.address=:80
  - --entrypoints.websecure.address=:443
  - --certificatesresolvers.letsencrypt.acme.httpchallenge=true
  - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
  - --certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}
  - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
  - --entrypoints.web.http.redirections.entrypoint.to=websecure
```

### Requirements
- Port 80 and 443 must be publicly accessible
- DNS A record must point to server IP
- Domain must be resolvable

### Certificate Storage
- Use persistent volume for `acme.json`
- Permissions must be `chmod 600`
- Mount as Docker volume (not bind mount on sensitive hosts)

### Service Labels
```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.service.rule=Host(`domain.com`)
  - traefik.http.routers.service.entrypoints=websecure
  - traefik.http.routers.service.tls.certresolver=letsencrypt
  - traefik.http.services.service.loadbalancer.server.port=8080
```

### Testing
- Use staging CA server first: `https://acme-staging-v02.api.letsencrypt.org/directory`
- Switch to production after validation

---

## 5. GitHub Actions SSH Deploy Patterns

### Best Practices
- Store SSH private key as secret (`PROD_SSH_KEY`)
- Pin known_hosts to prevent MITM (`PROD_KNOWN_HOSTS`)
- Use `appleboy/ssh-action` or similar for SSH commands
- Use `appleboy/scp-action` for file transfer

### Recommended Pattern (Current)
```yaml
- name: Copy Files
  uses: appleboy/scp-action@v0.1.7
  with:
    host: ${{ secrets.PROD_SSH_HOST }}
    username: ${{ secrets.PROD_SSH_USER }}
    key: ${{ secrets.PROD_SSH_KEY }}
    source: 'deploy_package/*'
    target: '/opt/titan/tmp_deploy_${{ github.sha }}'

- name: Execute Deploy
  uses: appleboy/ssh-action@v1.0.3
  with:
    host: ${{ secrets.PROD_SSH_HOST }}
    username: ${{ secrets.PROD_SSH_USER }}
    key: ${{ secrets.PROD_SSH_KEY }}
    script: |
      $DEPLOY_BASE/scripts/deploy.sh "${{ github.sha }}"
```

### Security Considerations
- Limit deploy user permissions (no shell, specific commands only)
- Use deployment keys (not personal SSH keys)
- Rotate keys periodically
- Audit SSH access logs

---

## 6. Implementation Implications

### For Titan Production Rebuild

1. **Droplet Spec**:
   - Image: Ubuntu 24.04 LTS
   - Size: s-4vcpu-8gb (8GB RAM, 4 vCPUs) for 15 services
   - Region: AMS3 (Amsterdam)
   - SSH Key: Pre-created deploy key

2. **Bootstrap Script Must**:
   - Create `deploy` user with sudo
   - Install Docker + Docker Compose v2
   - Configure SSH hardening
   - Create `/opt/titan` directory structure
   - Set up UFW (redundant to Cloud Firewall)

3. **Cloud Firewall**:
   - SSH from operator IP only
   - HTTP/HTTPS from all (for Traefik)
   - All other ports blocked

4. **Existing Traefik Config (Already Correct)**:
   - HTTP-01 challenge configured
   - HTTP→HTTPS redirect enabled
   - Certificate storage on persistent volume
   - Console service properly labeled

5. **GitHub Secrets to Update**:
   - `PROD_SSH_HOST`: New Droplet IP
   - `PROD_SSH_USER`: `deploy`
   - `PROD_SSH_KEY`: New deployment key
   - `PROD_KNOWN_HOSTS`: Generate from new Droplet

---

## Conclusion

The existing Titan infrastructure already follows most best practices for Traefik and CI/CD. The main work required is:

1. **Create**: Host provisioning scripts
2. **Create**: Cloud Firewall configuration
3. **Create**: Bootstrap/hardening script
4. **Update**: GitHub secrets after Droplet creation
5. **Document**: Complete runbook for operators

The docker-compose.prod.yml needs minor hardening (internal-only port exposure for infra services).
