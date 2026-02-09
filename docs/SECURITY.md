# Security Architecture

> **Status**: SOTA (State of the Art)
> **Compliance**: SOC2 Type II Ready (Target)

## 1. Authentication: OAuth 2.1
- **Standard**: OAuth 2.1 with PKCE (Proof Key for Code Exchange).
- **Implementation**: `OAuthService` + `AuthMiddleware`.
- **Flow**:
    1.  Public Client (Console) requests code with `code_challenge` (S256).
    2.  Server authenticates operator and issues ephemeral code.
    3.  Client exchanges code + `code_verifier` for JWT.
- **Tokens**: Short-lived (8h) JWTs signed with HMAC-SHA256 (HS256).

## 2. Authorization: PBAC (Permission-Based)
- **Model**: Role-Based Access Control (RBAC) backed by granular Permissions.
- **Roles**:
    - `SUPERADMIN`: Full access.
    - `OPERATOR`: Trade execution, system view.
    - `RISK_MANAGER`: Risk policy updates, circuit breaker resets.
    - `TRADER`: Trade execution only.
    - `VIEWER`: Read-only.
- **Enforcement**:
    - API Level: `AuthMiddleware.requirePermission()`.
    - Intent Level: `OperatorIntentService` validates Intent Type against Role.

## 3. Deployment Security
- **Zero Trust**: No implicit trust between containers.
- **Secrets**: 12-Factor Env Vars (managed via Platform).
- **Network**:
    - **DigitalOcean**: Private VPC for DB/Redis.
    - **Generic Cloud**: TLS termination at edge.

## 4. Audit & Compliance
- **Immutable Log**: All state changes recorded in `OperatorIntent` ledger.
- **Cryptographic Proof**: Every intent is signed by the Operator's private key.
