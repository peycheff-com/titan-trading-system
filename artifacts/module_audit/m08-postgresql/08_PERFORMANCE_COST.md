# Module M08 — PostgreSQL: Performance

> **Status**: **DRAFT**

## 1. Resource Allocation

- **Shared Buffers**: 25% RAM.
- **Effective Cache Size**: 75% RAM.
- **Work Mem**: 16MB.

## 2. Baselines

- **Write Throughput**: 5k rows/sec (Bulk copy).
- **Read Latency**: <5ms (Point lookup).
