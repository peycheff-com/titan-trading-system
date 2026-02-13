# Titan NATS Contract Versioning Policy

> This document governs how NATS subjects and message schemas are versioned.

## Subject Naming Convention

```
titan.{layer}.{domain}.{action}.v{N}[.{partition_tokens}]
```

| Segment | Purpose | Examples |
|---------|---------|---------|
| `layer` | `cmd`, `evt`, `data`, `sys`, `rpc`, `dlq`, `ops` | — |
| `domain` | Bounded context | `execution`, `brain`, `risk`, `market` |
| `action` | Verb/noun | `place`, `fill`, `ticker`, `halt` |
| `vN` | Schema version (monotonic) | `v1`, `v2` |
| Partition tokens | Optional routing tokens | `{venue}.{account}.{symbol}` |

## What Constitutes a Breaking Change

**Breaking** (requires new version `v{N+1}`):
- Removing or renaming a required field
- Changing a field's type
- Changing array item schema
- Adding a new **required** field without a default

**Non-breaking** (safe within current version):
- Adding a new **optional** field
- Widening an enum (adding new values)
- Adding a new subject in a new domain

## Version Lifecycle

1. **Active**: Current version, all producers and consumers use it.
2. **Deprecated**: Old version still published (dual-publish), new consumers should migrate.
3. **Removed**: Old version is no longer published. Deadline enforced via CI.

### Dual-Publishing During Migration

Use `getDualPublishSubjects()` to emit both the old and new subject during migration.
The migration deadline is tracked in `TITAN_SUBJECTS.LEGACY` with `@deprecated` JSDoc tags.

## Enforcement

| Check | Tool | CI Gate? |
|-------|------|----------|
| TS↔Rust subject sync | `scripts/ci/verify_subjects_sync.sh` | ✅ Yes |
| Raw subject usage ban | `scripts/ci/check_subjects.sh` | ✅ Yes |
| Schema backwards compat | `packages/shared/tests/contract/` | ✅ Yes |
| JSON Schema matches Zod | `packages/shared/tests/contract/` | ✅ Yes |

## Canonical Sources

- **TypeScript**: `packages/shared/src/messaging/titan_subjects.ts`
- **Rust**: `services/titan-execution-rs/src/subjects.rs` (must mirror TS)
- **JSON Schemas**: `packages/shared/schemas/json/` and `docs/contracts/`
