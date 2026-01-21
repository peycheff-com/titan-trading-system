# Repository Guidelines

## Project Structure & Module Organization
- `services/` contains the monorepo workspaces. Key services include `titan-brain` (orchestrator), `titan-execution-rs` (Rust engine), the phase services (`titan-phase1-scavenger`, `titan-phase2-hunter`, `titan-phase3-sentinel`), `titan-ai-quant`, `titan-powerlaw-lab`, `titan-console`, and shared libraries in `services/shared`.
- `config/` holds shared configuration; `docs/` and `monitoring/` store documentation and Prometheus/Grafana assets.
- Root-level `docker-compose*.yml` define local, staging, and production stacks.

## Build, Test, and Development Commands
- `npm install` installs all workspace dependencies.
- `npm run build` builds all workspaces that define a build script.
- `npm run start:brain` / `npm run start:console` / `npm run start:scavenger` (etc.) start individual services.
- `npm run start:execution` runs the Rust engine (`cargo run --release`).
- `npm run test:all` runs tests across workspaces; use `npm test -w services/<service>` for a single service.
- `npm run lint:all` and `npm run lint:fix` run ESLint across workspaces.
- `npm run format` / `npm run format:check` apply or verify Prettier formatting.
- `npm run validate:config` validates configuration files.
- `docker compose up -d` (or `docker compose -f docker-compose.prod.yml up -d`) starts the full stack.

## Coding Style & Naming Conventions
- TypeScript is linted with ESLint (`eslint.config.mjs`) and formatted with Prettier; prefer running `npm run format` over manual formatting.
- Use `camelCase` for variables/functions, `PascalCase` for types/classes, and `kebab-case` for service directories (e.g., `titan-phase2-hunter`).
- Unused function arguments should be prefixed with `_` to satisfy lint rules.

## Testing Guidelines
- Most services use Jest + ts-jest; tests live under `services/*/tests` with names like `*.test.ts`, `*.integration.test.ts`, or `*.property.test.ts`.
- `services/titan-execution-rs` uses `cargo test`.
- Some services expose split suites (e.g., `test:unit`, `test:integration`, `test:property`). Prefer targeted suites during development and `npm run test:all` before PRs.

## Commit & Pull Request Guidelines
- Commit messages follow a Conventional Commits style: `feat: ...`, `fix(scope): ...`, `chore: ...`.
- PRs should include a short description, testing notes (commands run), and any relevant config or deployment implications. Add screenshots for `titan-console` UI changes.

## Security & Configuration Tips
- Follow existing HMAC and exchange credential patterns in the service configs when adding new integrations.

## Codebase Hygiene & SOTA Toolchain
We treat the codebase like a Formula 1 car—it must be clean, light, and reliable. Future Agents MUST use the following **State-of-the-Art (SOTA)** tools to maintain repository health:

### 1. Verification Before Committing
Run `npm run sota:all` before any major PR to catch invisible issues.

| Command | Purpose | When to Use |
| :--- | :--- | :--- |
| `npm run sota:complexity` | **Complexity Scanner**. Identifies hard-to-maintain code. | When refactoring or exploring legacy code. |
| `npm run sota:god` | **God Class Detector**. Finds massive files (>400 LOC). | When deciding where to split large components. |
| `npm run sota:circular` | **Circular Dependency Guard**. | **MANDATORY** when adding new imports across service boundaries. |
| `npm run sota:arch` | **Architecture Fitness**. Enforces layer rules. | **MANDATORY** when creating new modules. |
| `npm run sota:dead` | **Dead Code Scanner**. | When performing cleanup or after major deletions. |
| `npm run sota:zombie` | **Zombie Dependency Scan**. | When updating `package.json` deps. |
| `npm run sota:secrets` | **Secret Scanner**. | **MANDATORY** before creating artifacts/pushing code. |
| `npm run sota:flake` | **Flakiness Detector**. | When a test fails "randomly" or "sometimes". |
| `npm run sota:impact` | **Smart Testing**. | To verify your changes without running the full suite. |

### 2. Hygiene Rules
- **No Dead Code**: If `sota:dead` reports it, delete it.
- **No God Classes**: If you touch a >400 LOC file, extract at least one function.
- **No Flakes**: Flaky tests are bugs. Use `sota:flake` to repro and fix.

