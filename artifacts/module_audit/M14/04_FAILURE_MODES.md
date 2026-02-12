# M14 — Failure Modes and Blast Radius

> **Rule**: If you cannot describe recovery deterministically, you do not own the module.
> **Trading context**: Every failure mode must state financial impact.

| # | Failure Mode | Trigger | Detection Signal | Auto Containment | Manual Runbook | Fund Risk? | Customer Impact | Recovery Steps | RTO | RPO |
|---|-------------|---------|-----------------|-----------------|----------------|-----------|----------------|----------------|-----|-----|
| 1 | External tool missing | `eslint`, `knip`, `prettier` not installed | Exit code non-zero, stderr | Catch block returns empty results | Install missing tool | No | CI pipeline fails | `npm install` | <1m | N/A |
| 2 | Git not available | Running outside git repo | `git rev-parse` throws | `findRepoRoot()` falls back to `process.cwd()` | Ensure git environment | No | Plan generation skipped | Initialize git repo | <1m | N/A |
| 3 | Plan file missing | Running `run` before `plan` | `fs.existsSync` returns false | `process.exit(1)` with error message | Run `quality:plan` first | No | Quality gate blocked | `npm run quality:plan` | <1m | N/A |
| 4 | SOTA check timeout | External command exceeds timeout | `execAsync` timeout rejection | Caught, marked as `failed`/`skipped` | Increase timeout or fix command | No | Check skipped in results | Adjust timeout in registry | <1m | N/A |
| 5 | Malformed plan JSON | Corrupted artifacts directory | `JSON.parse` throws | Unhandled — will crash | Regenerate plan | No | Pipeline restart needed | Delete plan, re-run | <1m | N/A |
| 6 | Disk full | Evidence pack write fails | `fs.writeFileSync` throws | Unhandled — will crash | Clear disk space | No | Evidence not persisted | Free space, re-run | <5m | N/A |

> **Note**: Quality OS is a developer tooling module with **zero financial impact**. All failure modes affect CI pipelines only.
