# M12 — Invariants

> Cross-reference system invariants I-01 through I-20.

## Control Loop (Cybernetics Lens)

### Essential Variables
- **Operator Identity**: Authenticated User.
- **Command Validity**: Structure and Signature.

### Actuators
- `NatsClient.publish()`: Emitting commands.

### Regulator Policy
- `AuthMiddleware`: Verify JWT.
- `CommandValidator`: Verify Schema.

## Module Invariants

| # | Invariant | System ID | Enforcement | Test | Evidence |
|---|-----------|-----------|-------------|------|----------|
| 1 | All Commands are Signed via HMAC | I-XX | `CommandService` | Code Review | — |
| 2 | Public Access Rejected | I-XX | `Fastify Auth` | Manual | — |
| 3 | **CRITICAL BUG**: Login Route Missing | I-XX | `index.ts` | **Audit** | `/auth/login` is not registered |
