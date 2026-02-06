# SOTA Remediation Plan - 2026-02-06

## Issues Identified

### Critical (Blocking `sota:all`)

| Issue | File | Fix Applied |
|-------|------|-------------|
| kvWatch API mismatch | `VenueStatusStore.ts` | Changed callback to async iterator |
| Import path errors | `ProposalGateway.ts` | Use barrel exports from `@titan/shared` |
| Import path errors | `ChangePointDetector.ts` | Use barrel exports from `@titan/shared` |
| Import path errors | `ExecutionQualityService.ts` | Use barrel exports from `@titan/shared` |
| Missing socket.io types | `acceptance-drill.ts` | Removed unused import |
| Unknown authData type | `acceptance-drill.ts` | Added type assertion |
| Invalid ed25519 options | `provenance.ts` | Removed `modulusLength` (not valid for ed25519) |
| Vite plugin type error | `vitest.config.ts` | Cast react plugin to bypass version mismatch |

## Remediation Status

All critical issues have been **RESOLVED**. The `sota:all` gate now passes with exit code 0.

## Files Modified

1. `services/titan-brain/src/services/venues/VenueStatusStore.ts`
2. `services/titan-brain/src/governance/ProposalGateway.ts`
3. `services/titan-brain/src/features/Risk/ChangePointDetector.ts`
4. `services/titan-brain/src/services/ExecutionQualityService.ts`
5. `scripts/acceptance-drill.ts`
6. `scripts/security/provenance.ts`
7. `apps/titan-console/vitest.config.ts`

## Remaining Warnings

ESLint style warnings (quote style, unused variables) exist but do not block the gate. These can be addressed in a future cleanup pass.
