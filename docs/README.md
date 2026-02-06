# Titan Documentation

> **Welcome to the Cortex.**

This directory contains the complete knowledge base for the Titan Trading System.

## 📚 Organization

The documentation is organized by **Domain** and **Role**.

### 1. Canonical Core (Must Read)
*The immutable laws of the system.*
- [**System Source of Truth**](canonical/SYSTEM_SOURCE_OF_TRUTH.md) (The Bible)
- [**Architecture**](canonical/ARCHITECTURE.md) (The Design)

### 2. By Role

| Role | Goal | Start Here |
| :--- | :--- | :--- |
| **Developer** | Build, Test, Extend | [Quickstart](dev/quickstart.md) |
| **Operator** | Deploy, Monitor, Fix | [Runbook](ops/operations_runbook.md) |
| **Researcher** | Backtest, Optimize | [Reproducibility](research/reproducibility.md) |
| **Auditor** | Verify Risk & Security | [Threat Model](security/threat_model.md) |

## 3. Directory Map

- **`canonical/`**: Architecture and invariants.
- **`dev/`**: Setup, config, CI, repo structure.
- **`ops/`**: Production deployment, incident response, observability.
- **`risk/`**: Policy, circuit breakers, limits.
- **`security/`**: Auth, secrets, threat model.
- **`organism/`**: Lifecycle of specific organs (Brain, Execution).
- **`reference/`**: API specs, NATS subjects, Database schema.
- **`research/`**: AI Quant and Backtesting standards.

## 4. Policy

1.  **Single Source of Truth**: Duplicate info is forbidden. Docs overlap? Merge and delete.
2.  **Evidence First**: Claims must be backed by file paths or command outputs.
3.  **Fail-Closed**: If a doc is ambiguous, assume the safer/stricter interpretation.
