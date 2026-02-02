# Reliability and High Availability Strategy

This document describes the intended HA posture and migration path from single-node to multi-node.

## Current Baseline (Single VPS)

- Single-node Docker Compose deployment
- RTO: 15 minutes (container restart/rebuild)
- RPO: 24 hours (nightly backups)

## Target HA Architecture (Multi-Node)

- **Brain and phases**: active-active across two nodes behind a load balancer
- **Execution**: active-active with dedicated NATS consumer groups
- **Postgres**: primary + streaming replica with automated failover
- **Redis**: sentinel or cluster for failover
- **NATS**: 3-node JetStream cluster with RAFT

## Failover Strategy

- Health checks route traffic away from unhealthy nodes
- Stateful services fail over via replication (Postgres, Redis, NATS)
- Use DNS or L4 load balancer for service endpoints

## RTO/RPO Targets (HA)

- **Core services**: RTO < 5 minutes
- **Datastores**: RPO < 5 minutes (continuous replication)

## Migration Steps

1. Split infrastructure (DB/Redis/NATS) onto dedicated nodes
2. Introduce replication and automated failover
3. Scale stateless services horizontally
4. Validate failover with controlled chaos tests
5. Update runbooks and SLO dashboards

## Open Items

- Finalize multi-node secrets distribution (Vault)
- Implement automated failover scripts
