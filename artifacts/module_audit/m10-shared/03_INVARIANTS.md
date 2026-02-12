# Module M10 — Shared Library: Invariants

> **Status**: **DRAFT**

## 1. Critical Invariants

| ID | Invariant | Check |
|----|-----------|-------|
| **LIB-001** | **No Circular Deps** | `madge` circular check |
| **LIB-002** | **Type Strictness** | `strict: true` in tsconfig |
| **LIB-003** | **Test Coverage** | >80% for util logic |

## 2. Verification

Verified in CI pipeline `shared-lib-check`.
