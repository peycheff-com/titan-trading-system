# Invariants: M06 NATS JetStream

## 1. Storage Invariants
- **Persistence**: All "System of Record" streams (Trades, Execution Events) **MUST** use `File` storage. Memory storage is **ONLY** permitted for ephemeral status (Venue Status) or cache.
- **Retention**: All streams **MUST** have an explicit `max_msgs` or `max_age` limit to prevent unbounded disk growth.
    - `TITAN_MARKET_TRADES`: Max 1M messages OR 7 days.
    - `TITAN_EXECUTION_EVENTS`: Max 100k messages OR 30 days.

## 2. Message Invariants
- **Envelope Compliance**: All events and commands **MUST** be wrapped in a standard Titan Envelope (v1).
- **Subject Canonicalization**:
    - All subjects **MUST** follow the hierarchy `titan.<type>.<domain>.<version>.<...>`
    - Hardcoded string subjects in code **MUST** be replaced with constants from `TitanSubject`.
- **Immutability**: Once published to a stream, a message **MUST NOT** be modified (JetStream guarantee).

## 3. Operational Invariants
- **Authentication**: All clients **MUST** authenticate with a user account (no anonymous access).
- **Isolation**: Services **MUST** only subscribe to subjects permitted by their Account ACLs in `nats.conf`.
- **Idempotency**: Consumers **MUST** handle duplicate deliveries (guaranteed at-least-once, not exactly-once).
