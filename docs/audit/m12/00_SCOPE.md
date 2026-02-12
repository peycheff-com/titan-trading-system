# Module: M12 (Titan Console API)

## Identity
- **Name**: `titan-console-api`
- **Purpose**: Backend-for-Frontend (BFF) serving the Titan Operator Console (M11). Handles authentication, credential management, and secure command dispatch to the NATS bus.
- **Architectural Plane**: Operator Plane / Control Plane
- **Type**: Fastify Service (Node.js)

## Code Packages
- `services/titan-console-api/`

## Owner Surfaces
- **Human-facing**:
    - HTTP API (Port 3001) consumed by `titan-console`.
- **Machine-facing**:
    - NATS Publisher (Ops Commands).
    - Internal API for credential retrieval (protected by strict auth).

## Boundaries
- **Inputs**:
    - HTTP Requests (Auth, Ops, Credentials)
    - Environment Variables (Secrets)
- **Outputs**:
    - NATS Commands (`titan.cmd.ops.>`)
    - JSON Responses
    - Audit Logs (PostgreSQL `credential_audit_log`)
- **Dependencies**:
    - PostgreSQL (Persistence)
    - NATS (Command Dispatch)
    - `@titan/shared` (Types, Schemas, Crypto)

## Tech Stack
- **Framework**: Fastify
- **Language**: TypeScript
- **Auth**: JWT + Env-based Master Password
- **Persistence**: PostgreSQL (`pg` driver)
