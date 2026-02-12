# Reality Assessment: M06 NATS JetStream

## 1. File Structure & Organization
- **Structure**:
    - Configuration is centralized in `config/` (`nats.conf`, `nats-entrypoint.sh`).
    - Topology definitions are in `packages/shared/src/messaging/nats-streams.ts`.
    - Verification scripts are scattered (`scripts/ops/check_nats.js`, `services/titan-execution-rs/scripts/...`).
- **Observation**: Separation of concerns is generally good. Infrastructure-as-Code (IaC) approach is taken for Stream definitions via TypeScript.

## 2. Code Quality & Implementation
### `config/nats.conf`
- **Security**: ACLs are enabled.
- **Accounts**: "TITAN" account is defined with specific users (`brain`, `execution`, `scavenger`, etc.).
- **Permissions**: Fine-grained publish/subscribe permissions are applied.
- **JetStream**: Enabled with `store_dir`, `max_mem`, `max_file`.
- **Secrets**: Passwords are injected via environment variables in `nats-entrypoint.sh`, preventing hardcoded secrets in the file. Good.

### `packages/shared/src/messaging/nats-streams.ts`
- **Streams Defined**:
    - `TITAN_VENUE_STATUS`: Memory-based, limits retention (1000 msgs, 24h).
    - `TITAN_MARKET_TRADES`: File-based, 7 days retention, 1M msgs, 10GB.
    - `TITAN_ORDERBOOKS`: File-based, 24h retention, 10GB.
    - `TITAN_EXECUTION_EVENTS`: File-based, 30 days retention, 100k msgs.
- **KV Buckets**:
    - `titan-venue-status`: Memory, TTL 5 min.
    - `titan-config`: File, persistent.
    - `titan-instruments`: File, TTL 24h.
- **Quality**: Definitions are typed (`TitanStreamConfig`) and exported.

### `scripts/ops/check_nats.js`
- **Status**: Extremely basic. Just logs exports. Not a real health check or audit tool.

## 3. Issues & Gaps
1. **`check_nats.js` is Trivial**: It provides no value for auditing or operations. Needs to be replaced with a real connectivity/stream verification script.
2. **Subject Canonicalization**: Need to ensure all subjects in `nats.conf` permissions match the subjects used in `nats-streams.ts` and actual service code.
    - `nats-streams.ts` uses `titan.data.venues.trades.v1.>`
    - `nats.conf` permissions allow `titan.data.market.>` for some services (e.g., Execution subscribes to `titan.data.market.>`). Need to verify if `market` vs `venues.trades` is a mismatch or alias.
3. **Retention Policies**: `TITAN_MARKET_TRADES` has `max_msgs: 1_000_000`. High frequency trading might exceed this quickly, leading to data loss before 7 days. 1M messages might be too low for "High-volume stream".

## 4. Stability & Reliability
- **JetStream Config**: `max_mem: 1G`, `max_file: 20G`. Need to verify if this is sufficient for the defined streams (10GB + 10GB + others potentially > 20GB).
- **Cluster**: `num_replicas: 1` everywhere. Single point of failure. Fine for dev/local, but for production (Gate A) we might want 3 replicas if running clustered.

## 5. Security
- **Auth**: Token/Password based.
- **Isolation**: Account separation is used.
