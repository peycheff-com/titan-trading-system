# Invariants: M11 (Titan Console)

## State Consistency
1.  **Authentication**: A valid JWT token in `localStorage` (`titan_jwt`) implies the user is authenticated.
2.  **Operator Identity**: `titan_operator_id` must match the subject of the JWT.
3.  **Optimistic Concurrency**: Any state-mutating intent (ARM/DISARM) must include the latest `state_hash` to prevent race conditions.

## Business Logic
1.  **Intent Idempotency**: Every operator intent must have a unique `idempotency_key` composed of `operator_id:type:timestamp`.
2.  **Intent TTL**: Pending intents expire after 60 seconds if not processed by the Brain.
3.  **Replay Mode**: When `isReplayMode` is true, the console must strictly display historical data and disable all command inputs (ReadOnly).
4.  **Verification**: A `VERIFIED` intent receipt must contain cryptographic evidence from the source of truth.

## UI/UX Invariants
1.  **Feedback Loop**: Every user action must result in an immediate UI state change (optimistic update) or a loading indicator.
2.  **Error Visibility**: All API errors must be surfaced to the user via Toasts.
