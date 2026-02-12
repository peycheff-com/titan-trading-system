# M14 — Contract Inventory

> **Rule**: If an integration exists without a contract listed here, it is a production bug.

## CLI Contracts
| Command | Subcommand | Options | Output |
|---------|-----------|---------|--------|
| `quality-os` | `plan` | — | `artifacts/quality_os/plans/<id>/plan.json` |
| `quality-os` | `run` | `--plan <path>` | 5 evidence packs in plan directory |
| `quality-os` | `fix` | `--dry-run` | `artifacts/quality_os/fix-report.json` |

## JSON Schema Contracts
| Schema | File | Validated By |
|--------|------|-------------|
| `QualityPlan` | `schemas/plan.schema.json` | `PlanCommand` output |
| `QualityPack` | `schemas/quality-pack.schema.json` | `generateQualityPack()` |
| `HygienePack` | `schemas/hygiene-pack.schema.json` | `runHygieneAnalysis()` |
| `SupplyChainPack` | `schemas/supply-chain-pack.schema.json` | `generateSupplyChainPack()` |
| `CostPack` | `schemas/cost-pack.schema.json` | `generateCostPack()` |

## NATS Subjects (this module)
N/A — Quality OS is a CLI tool, does not publish/subscribe to NATS.

## API Contracts
N/A — Quality OS is CLI-only, no HTTP endpoints.

## Exchange API Contracts
N/A — Quality OS does not interact with exchanges.

## DB Tables Owned
N/A — Quality OS writes JSON files to `artifacts/` directory only.

## Config and Environment
| Key | Type | Default | Fail-Closed? |
|-----|------|---------|--------------|
| `process.cwd()` | String | Git repo root | Yes — `git rev-parse --show-toplevel` fallback |
| `--plan <path>` | String | Latest `plan-*` directory | Yes — exits with error if none found |
| `--dry-run` | Boolean | `false` | Yes — simulates without applying |

## Error Taxonomy
| Code | Retryable | Fail-closed | Financial Impact? | Description |
|------|-----------|-------------|-------------------|-------------|
| Exit 1 | Yes | Yes | No | Plan not found or quality gate failed |
| ENOENT | Yes | Yes | No | Plan JSON file missing |
| Exec error | Yes | No | No | External tool (eslint, knip, etc.) failure |
