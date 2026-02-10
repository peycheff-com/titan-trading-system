# DigitalOcean Droplet Creation Guide

**Date**: 2026-02-06  
**Target**: Titan Production Droplet

---

## Prerequisites

1. DigitalOcean account with billing enabled
2. SSH public key uploaded to DigitalOcean
3. DNS access for `titan.peycheff.com`

---

## Droplet Specification

| Property | Value |
|----------|-------|
| **Region** | AMS3 (Amsterdam) |
| **Image** | Ubuntu 24.04 LTS |
| **Size** | s-4vcpu-8gb |
| **vCPUs** | 4 |
| **RAM** | 8 GB |
| **SSD** | 160 GB |
| **Monthly Cost** | ~$48/month |
| **Hostname** | titan-prod |
| **Tags** | `titan`, `production` |

---

## Option A: Create via Web Console

1. Log in to [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. Click **Create** → **Droplets**
3. Select:
   - **Region**: Amsterdam (AMS3)
   - **Image**: Ubuntu 24.04 LTS
   - **Size**: Basic → Regular → $48/mo (4 vCPU, 8 GB RAM)
   - **Authentication**: SSH Key (select pre-uploaded key)
   - **Hostname**: `titan-prod`
   - **Tags**: `titan`, `production`
   - **Monitoring**: Enabled ✓
4. Click **Create Droplet**
5. Record the IP address

---

## Option B: Create via doctl CLI

```bash
# Prerequisites
brew install doctl  # macOS
doctl auth init     # Configure API token

# Create Droplet
doctl compute droplet create titan-prod \
  --region ams3 \
  --image ubuntu-24-04-x64 \
  --size s-4vcpu-8gb \
  --ssh-keys "$(doctl compute ssh-key list --format ID --no-header | head -1)" \
  --enable-monitoring \
  --tag-names "titan,production" \
  --wait

# Get IP address
doctl compute droplet list --format Name,PublicIPv4
```

---

## Cloud Firewall Configuration

### Create Firewall via Console

1. Go to **Networking** → **Firewalls**
2. Click **Create Firewall**
3. Name: `titan-production`
4. **Inbound Rules**:

   | Type | Protocol | Port | Sources |
   |------|----------|------|---------|
   | SSH | TCP | 22 | Your IP only (e.g., 1.2.3.4/32) |
   | HTTP | TCP | 80 | All IPv4, All IPv6 |
   | HTTPS | TCP | 443 | All IPv4, All IPv6 |

5. **Outbound Rules**: All outbound (default)
6. **Apply to**: Droplets with tag `titan`
7. Click **Create Firewall**

### Create Firewall via doctl

```bash
# Replace YOUR_IP with your operator IP
doctl compute firewall create \
  --name titan-production \
  --inbound-rules "protocol:tcp,ports:22,address:YOUR_IP/32 protocol:tcp,ports:80,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:443,address:0.0.0.0/0,address:::/0" \
  --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0,address:::/0" \
  --tag-names titan
```

---

## DNS Configuration

After Droplet creation, update DNS:

1. Log in to your DNS provider (Cloudflare, Route53, etc.)
2. Create/Update A record:
   - **Name**: `titan`
   - **Type**: A
   - **Value**: `<DROPLET_IP>`
   - **TTL**: 300 (5 minutes)
3. Verify propagation:
   ```bash
   dig +short titan.peycheff.com
   # Should return DROPLET_IP
   ```

---

## Post-Creation Checklist

- [ ] Droplet created and IP recorded
- [ ] Cloud Firewall applied (only 22/80/443 open)
- [ ] DNS A record created for `titan.peycheff.com`
- [ ] DNS propagated (dig returns correct IP)
- [ ] SSH access verified: `ssh root@<IP>`

---

## Next Step

Run the bootstrap script:
```bash
ssh root@<DROPLET_IP> 'bash -s' < scripts/ops/do/01_bootstrap_host.sh
```
