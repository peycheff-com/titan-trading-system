# SOTA Quality Pipeline

This document explains the Titan SOTA (State-of-the-Art) quality pipeline.

## Quick Start

```bash
# Run all quality gates
npm run sota:all

# Run specific gates
npm run sota:typecheck     # Type checking
npm run sota:contracts:schemas  # NATS schema validation
npm run sota:runbooks      # Runbook coverage
```

## Gates Overview

### Code Quality
| Gate | Command | Description |
|------|---------|-------------|
| Circular Deps | `sota:circular` | Detects circular imports |
| Architecture | `sota:arch` | Enforces module boundaries |
| Complexity | `sota:complexity` | Ranks code complexity |
| Dead Code | `sota:dead` | Finds unused exports |
| Type Check | `sota:typecheck` | TypeScript compilation |

### Security & Supply Chain
| Gate | Command | Description |
|------|---------|-------------|
| Secrets | `sota:secrets` | Scans for leaked secrets |
| Audit | `sota:audit` | npm vulnerability scan |
| License | `sota:license` | License compliance |
| SBOM | `sota:sbom` | Generate SBOM (CycloneDX) |

### Contracts & Determinism
| Gate | Command | Description |
|------|---------|-------------|
| Schemas | `sota:contracts:schemas` | Validates NATS schemas |
| Determinism | `sota:replay:determinism` | Replay state verification |
| Edge Validation | `sota:edge:validation` | Checks ingress validation |

### Operability
| Gate | Command | Description |
|------|---------|-------------|
| Health Deps | `sota:health:deps` | Health check coverage |
| Metrics | `sota:metrics:required` | Required metrics exist |
| Runbooks | `sota:runbooks` | Required runbooks exist |
| Migrations | `sota:migrations:safety` | Migration reversibility |

## CI Integration

Gates run automatically on:
- **PR**: All gates except mutation testing
- **Nightly**: Full suite including mutation testing

## Interpreting Failures

Each gate prints a clear message on failure:
- ❌ indicates a blocking failure
- ⚠️ indicates a warning (may not block)

## Adding a New Service

1. Ensure service has `src/` directory structure
2. Add health check endpoint with dependency status
3. Add schemas to `contracts/nats/<subject>/`
4. Verify with `npm run sota:all`
