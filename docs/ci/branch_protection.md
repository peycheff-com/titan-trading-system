# Branch Protection Policy for CI

## Required status checks

For `main`, require only:

- `CI Pipeline Status`

All other CI jobs remain active but are non-required and roll up into the aggregator check above.

## Why

- Keeps required-check policy stable when CI internals evolve.
- Prevents branch-protection churn when jobs are split, merged, or renamed.
- Preserves strict gating because `CI Pipeline Status` fails on any failed/cancelled required job.

## Admin update checklist

1. Open repository settings for branch protection rules on `main`.
2. Remove per-job required checks.
3. Add `CI Pipeline Status` as the only required status check.
4. Save and verify on the next PR that only the aggregator is required.
