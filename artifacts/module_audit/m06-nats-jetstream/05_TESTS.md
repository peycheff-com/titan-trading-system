# Tests: M06 NATS JetStream

## 1. Test Coverage
| Component | Test File | Type | Coverage |
|-----------|-----------|------|----------|
| **Venue Status Flow** | `packages/shared/tests/integration/NatsVenueFlow.integration.test.ts` | Integration | High. Verify Pub/Sub, Schema, JetStream persistence. |
| **Execution Engine** | `services/titan-execution-rs/tests/integration_nats.rs` | System | Medium. Tests full loop (Intent -> Fill), but currently `#[ignore]`. |
| **Latency/Perf** | `services/titan-execution-rs/scripts/benchmark_nats_latency.mjs` | Performance | High. Measures RTT for orders. |
| **Client Lib** | `packages/shared/tests/unit/messaging/NatsClient.test.ts` | Unit | High. Tests envelope creation, connection logic. |

## 2. Testing Constraints
- **Infrastructure**: Tests require a running NATS JetStream server.
- **Isolation**: Integration tests create ephemeral streams (`TITAN_VENUE_STATUS_TEST`) to avoid polluting dev/prod streams.
- **Auth**: Rust tests require `NATS_URL`, `HMAC_SECRET` env vars.

## 3. Gaps & Recommendations
1. **ACL Verification**: No tests verify that users *cannot* publish to unauthorized subjects.
    - *Action*: Create a script to audit permissions by attempting forbidden actions.
2. **Stream Config Drift**: functionality exists to *apply* configs in `NatsClient`, but no test *verifies* that the running NATS server matches `nats-streams.ts` exactly (drift detection).
3. **Rust Integration Test Ignored**: `integration_nats.rs` is ignored. It should be part of the CI pipeline (with a NATS service container).
