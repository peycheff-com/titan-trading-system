# Module Security: M05 Execution Engine (Rust)

> **Generated**: 2026-02-11
> **Module**: M05 (titan-execution-rs)

## 1. Authentication & Authorization

-   **HMAC Verification**:
    -   Requires `HMAC_SECRET` env var.
    -   Validates generic internal signatures (if applicable to API/Commands).
    -   Fail-closed: Service refuses to start without secret (unless explicitly overridden for testing).

-   **DEX Signature Validation**:
    -   `DexValidator` component verifies Ed25519 signatures on specific command types (e.g., from untrusted clients).

## 2. Network Security

-   **NATS**:
    -   Supports User/Password authentication implementation (`NATS_USER`, `NATS_PASS`).
    -   TLS support depends on `async-nats` config (via `NATS_URL`).

-   **API**:
    -   Exposed on internal port `3002`.
    -   Protected by `AuthMiddleware` (checks `Authorization` header against HMAC).

## 3. Data Safety

-   **Persistence**: Local Redb file `titan_execution.redb`.
-   **Memory**: Sensitive keys (API secrets) are held in memory. `Drop` traits should ensure cleanup (Rust guarantees).

## 4. Risk Controls

-   **Hard Limits**: Max 20x leverage hardcoded.
-   **Circuit Breaker**: `GlobalHalt` shuts down order processing physically via atomic bool `ArmedState`.
