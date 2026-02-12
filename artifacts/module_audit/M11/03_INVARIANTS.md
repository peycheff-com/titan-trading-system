# M11 — Invariants

> Cross-reference system invariants I-01 through I-20.

## Control Loop (Cybernetics Lens)

### Essential Variables
- **Operator Intent**: Button clicks, Form submissions.
- **System View**: Real-time dashboard state.

### Actuators
- `fetch()`: API calls.

### Regulator Policy
- `AuthGuard`: Redirect to login if no token.

## Module Invariants

| # | Invariant | System ID | Enforcement | Test | Evidence |
|---|-----------|-----------|-------------|------|----------|
| 1 | All Mutations require Confirmation | I-XX | `Dialog` component | UI Test | — |
| 2 | Optimistic UI updates roll back on error | I-XX | `React Query` | UI Test | — |
