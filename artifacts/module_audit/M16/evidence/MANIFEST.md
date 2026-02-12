# Evidence Manifest - M16 Monitoring Stack

> Verification of SOTA compliance via Code, Configuration, and Tests.

## 1. Prometheus Infrastructure
- **Invariant**: Prometheus service exists and is configured
- **Evidence Type**: Config Reference
- **Location**: `docker-compose.yml` L97-107
- **Status**: ✅ Verified

## 2. Grafana Dashboard
- **Invariant**: Grafana service exists with dashboard provisioned
- **Evidence Type**: Config Reference
- **Location**: `docker-compose.yml` L109-122, `services/titan-brain/monitoring/grafana-dashboard-comprehensive.json`
- **Status**: ✅ Verified

## 3. Comprehensive Scrape Configuration
- **Invariant**: All 7 targets configured with correct ports and metric paths
- **Evidence Type**: Config Reference
- **Location**: `infra/monitoring/prometheus.yml`
- **Status**: ✅ Verified (after R1 remediation)

## 4. Alert Rules
- **Invariant**: 6 alert groups with rules for critical, performance, trading, connectivity, resources, business
- **Evidence Type**: Config Reference
- **Location**: `services/titan-brain/monitoring/alert-rules.yml` (300 lines)
- **Status**: ✅ Verified

## 5. SLO Definitions
- **Invariant**: SLOs defined for availability (99.9%), latency (P99 < 500ms), freshness (< 5s)
- **Evidence Type**: Config Reference
- **Location**: `monitoring/slos.yaml`
- **Status**: ✅ Verified

## 6. Brain PrometheusMetrics Tests
- **Invariant**: All 14 metrics tests pass
- **Evidence Type**: Test Output
- **Command**: `cd services/titan-brain && npx jest --testPathPattern='PrometheusMetrics' --no-coverage`
- **Result**: 14/14 pass (< 1s)
- **Status**: ✅ Verified

## 7. Scavenger PrometheusMetrics Tests
- **Invariant**: Scavenger metrics unit tests pass
- **Evidence Type**: Test Output
- **Command**: `cd services/titan-phase1-scavenger && npx jest --testPathPattern='PrometheusMetrics' --no-coverage`
- **Status**: ✅ Verified (after R4 remediation)

## 8. Tracing Configuration
- **Invariant**: Tempo configured for OTLP/gRPC trace collection
- **Evidence Type**: Config Reference
- **Location**: `monitoring/tempo/tempo.yaml`
- **Status**: ✅ Verified

## 9. Log Aggregation
- **Invariant**: Loki + Promtail configured for log collection
- **Evidence Type**: Config Reference
- **Location**: `monitoring/loki/`, `monitoring/promtail/`
- **Status**: ✅ Verified

## 10. StructuredLogger
- **Invariant**: Brain logger wraps `@titan/shared` Logger with correlation IDs
- **Evidence Type**: Code Review
- **Location**: `services/titan-brain/src/monitoring/StructuredLogger.ts` (460 lines)
- **Status**: ✅ Verified
