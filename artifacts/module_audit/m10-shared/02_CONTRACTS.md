# Module M10 — Shared Library: Contracts

> **Status**: **DRAFT**

## 1. Design Contracts

- **No Side Effects**: Utilities must be pure functions where possible.
- **Zero Deps**: Minimize external dependencies (lodash-free).
- **Isomorphic**: Must run in Node.js and Browser (for Console).

## 2. Stability

- **Versioning**: SemVer enforced.
- **Breaking Changes**: Checked via `tsc` in dependent projects.
