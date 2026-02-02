# CI/Quality Gates & SOTA Toolchain
This document outlines the automated quality gates used in the Titan repository.

## The Standard: "SOTA or Bust"
We follow a "State-of-the-Art" (SOTA) engineering philosophy. Linting is arguably the *least* we can do. We rely on deep static analysis, mutation testing, and impact analysis to maintain velocity without sacrificing stability.

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

## Toolchain Reference
For local development, use the `sota:*` scripts defined in `package.json`.

| Script | check | Metric / Rule |
| :--- | :--- | :--- |
| `sota:complexity` | Complexity | Cyclomatic < 15, Cognitive < 15 |
| `sota:god` | Maintainability | File lines < 400 |
| `sota:arch` | Architecture | Layer Violation (e.g. Infrastructure -> Domain) |
| `sota:bundle` | Performance | Bundle Size < Budget (e.g. 5MB) |
| `sota:impact` | Velocity | Only runs tests for changed workspaces |

See `AGENTS.md` for AI-specific behaviors regarding these tools.
