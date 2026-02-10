# Reference Documentation

[← Back to Index](../README.md)

## 📡 API & Protocols

- [**HTTP Endpoints**](api-http-catalog.md) — Catalog of REST endpoints.
- [**Brain API**](api-brain.md) — Detailed Brain Service API inputs/outputs.
- [**NATS Subjects**](api-nats-subjects.md) — Topic hierarchy definition.
- [**Scavenger Exchanges**](scavenger-exchanges.md) — Supported exchanges reference.
- [**Console WebSocket**](api-ws-console.md) — Console protocol.

## 💾 Data & Schema

- [**Database Schema**](database.md) — Postgres tables and relationships.
- [**Schema Catalog**](schema_catalog.md) — Data types and JSON schemas.

## 📜 System Source

- [**System Source of Truth**](../system-source-of-truth.md) — The Core Axioms.

---

# Titan API Overview (Merged)

> **Context**: Central Hub for all Titan APIs
> **Status**: Canonical

## 📡 Core Service APIs

| Service | Protocol | Spec | Status |
| :--- | :--- | :--- | :--- |
| **Titan Brain** | REST | [Brain API](api-brain.md) | Canonical |
| **Titan Execution** | NATS / REST | [NATS Subjects](api-nats-subjects.md) | Canonical |
| **Console API** | REST | [HTTP Endpoints](api-http-catalog.md) | Canonical |

## 🔌 Integration Points

- **NATS Event Bus**: The nervous system. See [NATS Subjects](api-nats-subjects.md).
- **Webhooks**: For external integrations. See `api-brain.md` for signature verification.
- **WebSocket**: Real-time feedback loop.

## 🔐 Security Headers

All internal APIs require:
- `x-titan-auth`: Service-to-service token.
- `x-signature`: HMAC-SHA256 of payload (if mutation).

