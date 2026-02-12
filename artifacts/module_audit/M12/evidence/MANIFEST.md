# Evidence Manifest - M12 Console API

> Verification of SOTA compliance via Code and Configuration.

## 1. Authentication
- **Invariant**: JWT required for protected routes.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-console-api/src/plugins/auth.ts`
- **Snippet**:
```typescript
// Line 21
const decoded = jwt.verify(token, secret);
```
- **Status**: ✅ Verified

## 2. Login Implementation (Remediation)
- **Invariant**: Login route exists.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-console-api/src/routes/auth.ts`
- **Snippet**:
```typescript
// Line 12
fastify.post('/auth/login', async (request, reply) => { ... })
```
- **Status**: ✅ Verified (Phase 7 Fix)

## 3. Ops Command Validation
- **Invariant**: Commands strictly typed.
- **Evidence Type**: Code Reference
- **Location**: `services/titan-console-api/src/routes/ops.ts`
- **Snippet**:
```typescript
// Line 49
const parse = OpsCommandSchemaV1.safeParse(cmd);
```
- **Status**: ✅ Verified
