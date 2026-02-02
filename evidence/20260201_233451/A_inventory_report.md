# DigitalOcean Inventory Report
## Generated: 2026-02-01T23:34:51+02:00

---

## Current Infrastructure

### Droplet
| Field | Value |
|-------|-------|
| **ID** | 547125671 |
| **Name** | titan-production-ams3 |
| **Region** | ams3 (Amsterdam 3) |
| **Status** | active |
| **Public IP** | 142.93.232.153 |
| **Private IP** | 10.110.0.4 |
| **Size** | s-2vcpu-4gb |
| **vCPUs** | 2 |
| **Memory** | 4096 MB |
| **Disk** | 80 GB |
| **Image** | Ubuntu 24.04 (LTS) x64 |
| **Created** | 2026-01-25T14:57:56Z |
| **VPC** | 3747d919-cc86-4e20-b17c-284c26b39a13 |
| **Cost** | $24/month |

### Reserved IPs
*None configured*

### Volumes
*None attached*

### Firewall
| ID | 7f98e4b2-bd19-4ab3-8854-3b812298dd09 |
|----|--------------------------------------|
| **Name** | titan-firewall |
| **Status** | succeeded |
| **Attached Droplets** | None (not attached!) |

**Inbound Rules:**
| Protocol | Port | Source |
|----------|------|--------|
| TCP | 22 | 0.0.0.0/0, ::/0 |
| TCP | 80 | 0.0.0.0/0, ::/0 |
| TCP | 443 | 0.0.0.0/0, ::/0 |

**Outbound Rules:**
- ICMP, TCP, UDP → all destinations (unrestricted)

### SSH Keys
| ID | Name | Fingerprint |
|----|------|-------------|
| 53578109 | ivan-local-ed25519 | b3:1f:51:3e:48:c5:44:b0:c1:50:d3:3c:91:cf:f3:f8 |

### Domains
*None configured*

---

## Security Observations

> [!WARNING]
> **Firewall not attached to droplet!** The firewall rules exist but are not applied.

> [!CAUTION]
> **SSH open to all IPs** - Should be restricted to operator IPs only.

---

## Deployment Strategy Decision

**Selected: Strategy B (Wipe existing droplet)**

Rationale:
- Single droplet already provisioned on correct size/region
- No reserved IP (direct IP cutover not required)
- No attached volumes (clean wipe possible)
- Cost-effective: reuse existing resources

---

## Next Steps

1. SSH into droplet: 142.93.232.153
2. Stop all containers and wipe Docker state
3. Remove deployment directories
4. Fresh deploy from repo
5. Attach firewall to droplet
6. Verify all gates
