# Performance & Cost: M06 NATS JetStream

## 1. Performance Targets
- **Throughput**: Support > 10,000 messages/sec for market data (`titan.data.venues.trades.>`).
- **Latency**: < 1ms internal RTT for Intent -> Ack.
- **Start-up**: < 5s for full stream recovery.

## 2. Resource Allocation
- **Memory**: `max_mem: 1G`.
- **Storage**: `max_file: 20G`.
- **CPU**: NATS is highly efficient, typically < 1 core for moderate load.

## 3. Cost Analysis
- **Storage Cost**: 20GB EBS is negligible (< $2/month).
- **Data Transfer**: Inter-AZ transfer costs if services are distributed. NATS binary protocol is compact.
- **Retention**:
    - `TITAN_MARKET_TRADES`: 10GB cap. High churn.
    - `TITAN_EXECUTION_EVENTS`: Low volume, long retention.

## 4. Benchmarks
- **Script**: `services/titan-execution-rs/scripts/benchmark_nats_latency.mjs`.
- **Baseline**: 0.2ms mean latency on localhost. 2ms on LAN.

## 5. Scalability
- **Current**: Single server.
- **Limit**: Vertical scaling (CPU/Mem/Disk).
- **Future**: NATS Clustering (Raft) for HA and horizontal read scaling.
