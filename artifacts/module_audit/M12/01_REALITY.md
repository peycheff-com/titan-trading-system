# M12 — Reality Snapshot

> What the code actually does today vs. what docs claim.

## Build Status
- [x] Transpiles cleanly (`tsc`)
- [x] Tests exist (`tests/unit/health.test.ts`)
- [x] Docker build: Standard Node.js

## Doc-to-Code Alignment
| Claim (from docs) | Code Reality | Gap? |
|--------------------|-------------|------|
| "BFF Pattern" | Fastify serving API | ✅ |
| "Authentication" | `jsonwebtoken` used but validates against plain-text env var `TITAN_MASTER_PASSWORD` (no hashing). | ⚠️ **MVP Auth** |

## Exchange Connectivity
| Exchange | Protocol | Adapter File | Tested Live? |
|----------|----------|--------------|-------------|
| N/A | — | — | — |

