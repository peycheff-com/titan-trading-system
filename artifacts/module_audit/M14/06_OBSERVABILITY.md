# M14 — Observability and Operations

## SLOs and SLIs
| SLI | SLO Target | Measurement | Window |
|-----|-----------|-------------|--------|
| Plan generation success rate | 100% | CLI exit code | Per invocation |
| Quality gate accuracy | 0 false passes | Evidence pack verification | Per plan execution |
| SOTA check completion | All required checks pass | `sota-pack.json` summary | Per run |

## Metrics
| Metric Name | Type | Labels | Alert Threshold |
|-------------|------|--------|----------------|
| `quality_gate_verdict` | gauge | `tier`, `plan_id` | Failed = 0 |
| `sota_checks_passed` | counter | `category`, `required` | Required_failed > 0 |
| `test_duration_ms` | gauge | `package`, `command` | > 300s |
| `evidence_packs_generated` | counter | `plan_id` | < 5 per run |

> **Note**: Metrics are emitted as structured JSON in evidence packs, not Prometheus. The module is a CLI tool, not a long-running service.

## Logs
| Structured Field | Required? | Description |
|-----------------|-----------|-------------|
| Chalk-colored CLI output | yes | Human-readable progress (`✅`, `❌`, `⚠️`) |
| Evidence pack JSON | yes | Machine-readable structured output in `artifacts/quality_os/` |
| `plan_hash` / `pack_hash` | yes | SHA256 determinism vectors |

## Traces
N/A — CLI tool, no distributed tracing. Correlation via `plan.id` (timestamp-based).

## Dashboards and Alerts
| Dashboard | Tool | SLOs Mapped |
|-----------|------|------------|
| CI Pipeline | GitHub Actions | Quality gate pass/fail |
| Evidence Packs | JSON files in `artifacts/` | All SLIs above |

## On-Call Runbook
N/A — Developer tooling module. No on-call requirements.
If CI pipeline fails, inspect evidence packs in `artifacts/quality_os/plans/<plan-id>/`.
