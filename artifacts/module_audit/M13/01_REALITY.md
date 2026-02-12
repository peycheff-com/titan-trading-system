# M13 — Reality Snapshot

> What the code actually does today vs. what docs claim.

## Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] Docker build: multi-stage, `node:22-alpine` + `docker-cli`
- [x] **Tests exist** — `tests/CommandExecutor.test.ts` (7 test cases covering allowlist, deploy, halt, evidence, failures)
- [x] **Uses shared Logger** — `Logger.getInstance('titan-opsd')` in both `index.ts` and `CommandExecutor.ts`

## Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "Privileged Executor" | Mounts `docker.sock`, runs `docker compose` commands | ✅ |
| "Signature Verification" | Uses `verifyOpsCommand()` from `@titan/shared` with `timingSafeEqual` | ✅ |
| "Allowlist-restricted restart" | `validateTarget()` checks against `ALLOWED_SERVICES` array | ✅ |
| "Deploy safety" | `handleDeploy()` calls `validateTarget()` — service name validated against allowlist | ✅ |
| "Receipt publishing" | `OpsReceiptSchemaV1.parse()` validates before publish | ✅ |
| "Structured logging" | Uses `Logger.getInstance('titan-opsd')` from `@titan/shared` | ✅ |
| "Graceful shutdown" | `SIGTERM`/`SIGINT` handlers registered in `main()`, calls `shutdown()` | ✅ |

## Key Code Observations
1. **`index.ts`** (146 lines): Clean NATS subscriber loop. Schema validation → HMAC verification → execution → receipt. Graceful shutdown via SIGTERM/SIGINT handlers.
2. **`CommandExecutor.ts`** (127 lines): Switch-based command dispatch. `validateTarget()` enforces allowlist for both restart and deploy. `runDocker()` spawns child process, properly awaits both stdout/stderr streams.
3. **`OPS_SECRET`**: Loaded from env, fail-fast if missing (`process.exit(1)`).
4. **Allowlist**: Hardcoded (not configurable), contains 8 services. Adding a new service requires a code change + deploy.

