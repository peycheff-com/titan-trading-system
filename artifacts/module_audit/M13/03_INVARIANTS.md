# M13 — Invariants

> Cross-reference system invariants I-01 through I-20.

## Control Loop (Cybernetics Lens)

### Essential Variables
- **System Health**: Running/Stopped state of Docker containers.
- **Privilege Level**: Root access to Docker socket (container management).
- **Command Authenticity**: Only HMAC-verified commands execute.

### Actuators
- `CommandExecutor.runDocker()`: Spawns `docker compose` subprocesses.

### Regulator Policy
- `verifyOpsCommand()`: HMAC-SHA256 with `timingSafeEqual` from `@titan/shared`.
- `ALLOWED` array: Service restart allowlist (hardcoded).

## Module Invariants

| # | Invariant | Enforcement | Test | Evidence |
|---|-----------|-------------|------|----------|
| 1 | **No unsigned command executes** | `verifyOpsCommand(cmd, OPS_SECRET)` returns false → receipt with FAILURE + early return | ❌ No test | `index.ts:54` |
| 2 | **Restart restricted to allowlist** | `ALLOWED.includes(service)` check in `handleRestart()` | ❌ No test | `CommandExecutor.ts:51` |
| 3 | **Missing OPS_SECRET = immediate exit** | `process.exit(1)` if `!OPS_SECRET` | ❌ No test | `index.ts:24-27` |
| 4 | **Schema-validated input** | `OpsCommandSchemaV1.safeParse(data)` rejects malformed | ❌ No test | `index.ts:46-50` |
| 5 | **Schema-validated output** | `OpsReceiptSchemaV1.parse(receipt)` before publish | ❌ No test | `index.ts:112` |
| 6 | **Docker exit code propagated** | `code !== 0` → reject with stderr | ❌ No test | `CommandExecutor.ts:99-102` |
| 7 | **Deploy lacks allowlist** ⚠️ | NO enforcement — any `target` accepted | ❌ No test | `CommandExecutor.ts:63-79` |
