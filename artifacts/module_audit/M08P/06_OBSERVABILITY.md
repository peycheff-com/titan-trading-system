# M08P — Observability and Operations

## SLOs and SLIs
| SLI | SLO Target | Measurement | Window |
|-----|-----------|-------------|--------|
| <!-- --> | <!-- --> | <!-- --> | <!-- --> |

## Metrics
| Metric Name | Type | Labels | Alert Threshold |
|-------------|------|--------|----------------|
| <!-- --> | gauge/counter | <!-- --> | <!-- --> |

## Logs
| Structured Field | Required? | Description |
|-----------------|-----------|-------------|
| `signal_id` | yes | UUID v4 end-to-end tracking |
| `correlation_id` | yes | UUID v4 request correlation |

## Traces
| Span Name | Correlation ID | Parent |
|-----------|---------------|--------|
| <!-- --> | <!-- --> | — |

## Dashboards and Alerts
| Dashboard | Tool | SLOs Mapped |
|-----------|------|------------|
| <!-- --> | Grafana | <!-- --> |

## On-Call Runbook
- Runbook entries: `docs/runbooks/…`
- Operator commands: ARM, DISARM, HALT via `titan.cmd.operator.*`

> **Rule**: No black boxes. Every production failure must have a first-minute diagnosis path.
