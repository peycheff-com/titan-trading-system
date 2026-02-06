# Secrets & Rotation Architecture

> **Status**: Canonical
> **Implementation**: AES-256-GCM / Docker Secrets

## 1. Secret Classification

| Class | Examples | Storage | Rotation |
| :--- | :--- | :--- | :--- |
| **S0 (Root)** | `TITAN_MASTER_PASSWORD`, `SSH Keys` | Offline / Stick | Annually |
| **S1 (Infra)** | `POSTGRES_PASSWORD`, `NATS_SYS_PASS` | `.env.prod` / Vault | Quarterly |
| **S2 (App)** | `HMAC_SECRET`, `JWT_SECRET` | `.env.prod` | On Compromise |
| **S3 (External)** | `BYBIT_API_KEY`, `OPENAI_KEY` | Exchange / `.env` | 90 Days |

## 2. SOTA Credential Management (2026)

Titan implements "Zero-Secret" operations where possible.
- **Frontend**: No secrets stored in `localstorage`. JWT only (HttpOnly).
- **Backend**: Encrypted Vault (AES-256-GCM) for storing Exchange Keys.
- **IPC**: HMAC signatures verifying origin, not just identity.

### 2.1 The Vault
The `Config Service` (`@titan/shared`) offers a lightweight Vault abstraction.
- On Boot: Loads `.env`.
- On Request: Decrypts values in memory.
- Invariant: **Never log raw secrets.**

## 3. Rotation Mechanics

### 3.1 HMAC Rotation (The "Big One")
Updating `HMAC_SECRET` breaks all IPC.
**Procedure**:
1. Stop `titan-brain` and `titan-execution`.
2. Update secret in environment.
3. Start both simultaneously.

### 3.2 Key Revocation
If an API key leaks:
1. **Kill Switch**: `CMD.RISK.HALT` (Pauses trading).
2. **Revoke**: Delete key on Exchange website.
3. **Rotate**: Update `.env.prod`.
4. **Resume**: `CMD.OPERATOR.ARM`.
