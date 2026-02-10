# SOTA Quality Pipeline

> **Status**: Canonical
> **Context**: CI/CD Quality Gates

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

## The Standard: "SOTA or Bust"

We follow a "State-of-the-Art" (SOTA) engineering philosophy. Linting is arguably the *least* we can do. We rely on deep static analysis, mutation testing, and impact analysis to maintain velocity without sacrificing stability.

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

## Continuous Integration Gates

### 1. Build & Basic Lint

- **Trigger**: Every Push
- **Tools**: `npm run build`, `eslint`, `prettier`
- **Why**: Basic syntax and type correctness.

### 2. SOTA Hygiene Scan (The "SOTA" Block)

- **Trigger**: Pull Requests
- **Tools**:
  - **Dead Code**: `knip` (No unused exports allowed)
  - **Zombie Deps**: `depcheck` (No unused packages)
  - **Circular Deps**: `madge` (Graphs must be acyclic)
  - **Structure**: `dependency-cruiser` (No illegal layer crossings)
  - **Secrets**: Regex-based scanning for keys.
- **Fail Condition**: Any violation halts the merge.

### 3. Test Reliability Layer

- **Trigger**: Nightly or on 'Critical' PRs
- **Tools**:
  - **Flakiness Detector**: `npm run sota:flake` (Runs suite 10x)
  - **Mutation Testing**: `npm run sota:mutation` (Verifies test asserts actually test code)

## CI Integration

Gates run automatically on:

- **PR**: All gates except mutation testing
- **Nightly**: Full suite including mutation testing

## Toolchain Reference

For local development, use the `sota:*` scripts defined in `package.json`.

| Script | check | Metric / Rule |
| :--- | :--- | :--- |
| `sota:complexity` | Complexity | Cyclomatic < 15, Cognitive < 15 |
| `sota:god` | Maintainability | File lines < 400 |
| `sota:arch` | Architecture | Layer Violation (e.g. Infrastructure -> Domain) |
| `sota:bundle` | Performance | Bundle Size < Budget (e.g. 5MB) |
| `sota:impact` | Velocity | Only runs tests for changed workspaces |

## Interpreting Failures

Each gate prints a clear message on failure:

- ❌ indicates a blocking failure
- ⚠️ indicates a warning (may not block)

## Adding a New Service

1. Ensure service has `src/` directory structure
2. Add health check endpoint with dependency status
3. Add schemas to `contracts/nats/<subject>/`
4. Verify with `npm run sota:all`
