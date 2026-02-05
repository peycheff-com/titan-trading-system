# 00 Scope - Titan SOTA Quality Orchestrator Upgrade

## Repository Inventory
- **Path**: `/Users/ivan/Code/trading/titan`
- **Package Manager**: npm 11.6.2
- **Node Version**: `>=20.0.0`
- **Monorepo Strategy**: npm workspaces (`services/*`, `packages/*`, `apps/*`)
- **Build System**: Turbo
- **Languages**: TypeScript (Node.js), Rust (`titan-execution-rs`)

## Services Inventory
| Service | Language | Type | Key Deps |
|Stats|---|---|---|
| `titan-brain` | TypeScript | Orchestrator | NATS, Postgres, Redis |
| `titan-execution-rs` | Rust | Execution Kernel | NATS, Tokio |
| `titan-console-api` | TypeScript | BFF API | Fastify, NATS |
| `titan-opsd` | TypeScript | Ops Daemon | NATS, Docker |
| `titan-phase1-scavenger` | TypeScript | Strategy | NATS |
| `titan-phase2-hunter` | TypeScript | Strategy | NATS |
| `titan-phase3-sentinel` | TypeScript | Strategy | NATS |
| `titan-ai-quant` | TypeScript | Optimization | NATS |
| `titan-powerlaw-lab` | TypeScript | Analysis | NATS |

## Infrastructure
- **Orchestration**: Docker Compose (Dev/Prod)
- **Message Bus**: NATS JetStream (v2.10.22-alpine)
- **Database**: Postgres 16-alpine (`titan_brain_production`)
- **Cache**: Redis 7.2.4

## Critical Surfaces
1. **NATS JetStream**:
   - Primary backbone for ALL inter-service communication.
   - Used by Brain, Execution, Console, and Strategy phases.
   - Subjects: Market data, Orders, Risk checks, Ops commands.

2. **HTTP Interfaces**:
   - `titan-console-api`: Port 3000 (User facing)
   - `titan-brain`: Port 3100 (Dashboard/Metrics)
   - `titan-console`: Port 8080 (Static UI)

3. **Risk & Policy**:
   - Config usage: `config/nats.conf`, environment variables (Secrets).
   - "Brain" acts as central orchestrator.

## Existing SOTA Scripts
Found in `package.json` and `scripts/sota/`:
- `sota:all` (Aggregation)
- `sota:circular`, `sota:arch`, `sota:complexity`, `sota:god`, `sota:dead` (Static Analysis)
- `sota:immutability` (ESLint)
- `sota:secrets`, `sota:zombie`, `sota:flake` (Security/Stability)
- `sota:rust:*` (Rust specific toolchain)
- `sota:audit`, `sota:license`, `sota:deps` (Supply Chain)

## Gaps Identified (Pre-Run)
- **Event Contracts**: No explicit schema validation visible in scripts yet.
- **Determinism**: No replay/idempotency gates.
- **Drift Detection**: `sota:api` exists but needs verification.
- **Rollback/Restore**: No automated drill visible in `sota:all`.
