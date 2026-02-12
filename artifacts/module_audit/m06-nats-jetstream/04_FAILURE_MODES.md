# Failure Modes: M06 NATS JetStream

## 1. Infrastructure Failures
| Failure Mode | Impact | Mitigation | Detection |
|--------------|--------|------------|-----------|
| **NATS Broker Crash** | Global outage, no messaging. | Client auto-reconnect (`maxReconnectAttempts: -1`). | Service Health Checks fail. |
| **Disk Full (`/data/jetstream`)** | NATS rejects new writes. Streams freeze. | `max_bytes` limits on streams. Alerting on disk usage. | `nats_jetstream_available_storage_bytes` metric. |
| **Network Partition** | Split brain (if clustered) or disconnect. | Clients buffer/retry. | Connection logs/events. |

## 2. Stream Failures
| Failure Mode | Impact | Mitigation | Detection |
|--------------|--------|------------|-----------|
| **Stream Full (Limits Reached)** | Old messages discarded (`DiscardPolicy.Old`). | Appropriate retention limits. | `nats_stream_state_messages` metric. |
| **Slow Consumer** | Consumer lags, eventually cut off or misses data. | JetStream Pull Consumers (flow control). | `nats_consumer_num_pending_pull` metric. |
| **Corrupted Stream File** | Data loss for that stream. | Replication (currently `num_replicas: 1` -> Risk!). | NATS startup logs. |

## 3. Application Failures
| Failure Mode | Impact | Mitigation | Detection |
|--------------|--------|------------|-----------|
| **Poison Message** | Consumer crashes repeatedly on same message. | Max delivery attempts (DLQ). | DLQ Monitoring (`titan.dlq.>`). |
| **Schema Violation** | Client fails to parse message. | Strict Schema validation at ingress/egress. | Error logs in client. |
