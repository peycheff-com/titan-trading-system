# Testing & CI Standard

> **Status**: Canonical
> **Pipeline**: GitHub Actions

## 1. The Strategy

Titan employs a "Shift-Left" testing strategy.

1.  **Static Analysis**: Types, Linters, Dependency Checks.
2.  **Unit Tests**: Logic verification (Brain/Risk).
3.  **Integration Tests**: Artifact-based contract verification.
4.  **Backtests**: Simulation of strategies.

## 2. Test Commands

### 2.1 Unit Tests
```bash
# Brain (Jest)
npm run test:brain

# Execution (Rust)
cargo test --package titan-execution-rs
```

### 2.2 Integration (The Harness)
The `titan-harness` package spins up ephemeral NATS and simulates signals.
```bash
npm run test:integration
```

## 3. Continuous Integration (CI)

Our CI pipeline (`.github/workflows/main.yml`) enforces the following gates:

### 3.1 The "SOTA" Check
Script: `./scripts/ci/check_sota.sh`
- Verifies that `package-lock.json` is in sync.
- Verifies that no "dual truth" docs exist.
- Verifies that all NATS subjects used in code are documented in the registry.

### 3.2 Contract Validation
Script: `./scripts/ci/check_contracts.sh`
- Ensures JSON Schemas in `@titan/shared` match the struct definitions in Rust.

## 4. Linting
- **TypeScript**: ESLint + Prettier.
- **Rust**: Clippy (`cargo clippy`).
- **Markdown**: `markdownlint`.

**Invariant**: CI fails on *any* warning. We do not tolerate "noise" in logs.
