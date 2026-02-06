# Repository Structure (Monorepo)

> **Status**: Canonical
> **Toolchain**: Turbo Repo + NPM Workspaces

## 1. Topography

```text
titan/
├── apps/                 # User Interfaces (Frontend)
│   └── titan-console/    # React/Vite Dashboard
├── services/             # Backend Microservices (Dockerized)
│   ├── titan-brain/      # Orchestrator (TS)
│   ├── titan-execution-rs/ # Execution Engine (Rust)
│   ├── titan-phase*/     # Strategies
│   └── titan-opsd/       # Ops Daemon (Node.js)
├── packages/             # Shared Libraries (NPM)
│   ├── shared/           # @titan/shared (Types, Schemas, Utils)
│   └── titan-harness/    # Integration Tests
├── config/               # Global Configuration
├── scripts/              # CI/CD and Ops Scripts
└── docs/                 # Documentation (Source of Truth)
```

## 2. Boundaries

### 2.1 Services vs Packages
- **Services** are runnable applications. They define `Dockerfile`. They have a `main()` entrypoint.
- **Packages** are libraries. They are imported by services. They export `index.ts`.

### 2.2 Shared Library (`@titan/shared`)
The spine of the repo.
- **What goes here**:
  - TS Interfaces (Schemas).
  - NATS Subject Definitions.
  - Test Utilities.
  - Config Parsers.
- **Rule**: If 2+ services need it, put it in Shared.

## 3. Adding a New Service

1. Create folder in `services/`.
2. `npm init`.
3. Add `Dockerfile`.
4. Add to `docker-compose.yml`.
5. Implement `/health`.
6. Add to `titan-console` monitoring.
