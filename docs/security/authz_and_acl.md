# Authorization & ACLs

> **Status**: Canonical
> **Mechanism**: NATS 2.0 Auth (config/nats.conf)

## 1. Principle of Least Privilege

Service identities are isolated. A compromised "Strategy" container cannot empty the wallet because it lacks the **Permission** to speak to the Execution Engine.

## 2. NATS Users

| User | Config Name | Capabilities | Rationale |
| :--- | :--- | :--- | :--- |
| **Brain** | `brain` | `PUB: >`, `SUB: >` | The Cortex needs to see and say everything. |
| **Execution** | `execution` | `PUB: titan.evt.execution.>`<br>`SUB: titan.cmd.execution.>` | Can only report fills; cannot order itself to trade. |
| **Strategies** | `scavenger`, `hunter` | `PUB: titan.evt.{phase}.signal` | Can only speak when they see something. |
| **Console** | `console` | `SUB: titan.data.>`, `titan.evt.>` | Read-only visibility (mostly). |

## 3. Web UI Authorization

The Console (`titan-console`) is protected by a 2-layer auth system:
1.  **Traefik Basic Auth** (Optional/Legacy): Edge protection.
2.  **App Level (JWT)**:
    - User logs in with `TITAN_MASTER_PASSWORD`.
    - Server issues `HttpOnly` cookie.
    - All API routes verify JWT signature (`JWT_SECRET`).

**Invariant**: There is no "Guest" mode. You are either the Operator (God Mode) or nothing.
