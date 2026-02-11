# Titan Autonomous Quality OS

The **Titan Quality OS** is the autonomous nervous system of the repository. It enforces quality, hygiene, and security through deterministic, evidence-based gates. It treats CI/CD minutes as a burn rate to be optimized and code not as a static asset, but as a living organism that must be actively maintained.

## 🧠 Core Philosophy

1.  **Evidence-First**: No change is valid without an **EvidencePack** proving its safety. "Works on my machine" is not evidence. A hashed, verifiable artifact from a clean environment is.
2.  **Deterministic**: Given the same input (commit SHA + plan), the Quality OS must produce the exact same output (QualityPack hash).
3.  **Fail-Closed**: If the Quality OS cannot verify safety (e.g., tool failure, ambiguous diff), it escalates to the highest risk level.
4.  **One Canon**: There is only one source of truth. If a doc exists here, it is the law. If it contradicts code, the code is wrong (or the doc is outdated and must be fixed *atomically* with the code).

## 🛡️ Gates (Enforcement Levels)

Run checks based on **Diff Risk**, not habit.

| Gate | Trigger | Scope | Purpose |
| :--- | :--- | :--- | :--- |
| **Gate A** | `pull_request` | **Diff-Aware** | Fast, focused feedback. Runs only what is affected by the diff + critical invariants. |
| **Gate B** | `push` (main) | **Workspace** | Full assurance for merged code. Verifies integration across the monorepo. |
| **Gate C** | `schedule` (nightly) | **Exhaustive** | Deep hygiene, long-running chaos tests, full fuzzing, dead code proofs. |
| **Gate D** | `release` (tag) | **Release-Grade** | Provenance, SBOM, policy parity proofs, artifact hashing, signature verification. |

## 🔧 Fix Policy (Autonomy Levels)

We classify fixes by their safety to determine if they can be auto-applied.

| Level | Policy | Description | Examples |
| :--- | :--- | :--- | :--- |
| **F0** | **Auto-Apply** | Proven safe. Machine-verifiable reversibility. No semantic change. | Formatting (Prettier), unused imports (in isolated files), sorting JSON keys, fixing broken internal links to canonical targets. |
| **F1** | **PR-Required** | Safe but impactful. Requires human visibility via PR entry. | Dependency updates, performance tuning, refactors altering control flow, schema additions. |
| **F2** | **Human Approval** | Critical risk. Requires explicit `CODEOWNERS` sign-off. | Execution logic, Risk Policy, NATS ACLs, Encryption/Security rules, DB Migrations altering data. |

## 📊 Diff Risk Classifier

The **QualityKernel** classifies every PR into a Risk Tier determining required checks.

| Risk Tier | Triggers | Required Gates/Checks |
| :--- | :--- | :--- |
| **High** | `services/titan-execution-rs/**`, `packages/shared/**`, `config/nats.conf`, `.github/**`, `migrations/**` | **Full Gate B** + Specialized Security/Contract Checks. |
| **Medium** | `services/**` (logic), `packages/**` (lib libraries) | **Gate A** + Integration Tests for affected service. |
| **Low** | `docs/**`, `scripts/**` (non-core), `**/*.md` | **Gate A** (Lint + Link Check only). |

## 📦 EvidencePacks (The Receipts)

All Quality OS outputs are JSON objects adhering to strict schemas in `packages/quality-os/src/schemas`.

*   **`QualityPack`**: Test results, coverage, lint status, typecheck results.
*   **`HygienePack`**: Dead code proofs, doc integrity graph, circular dependency checks.
*   **`SupplyChainPack`**: Dependency audit (cargo/npm), pinning verification, SBOM.
*   **`CostPack`**: Runtime minutes, cache hit rates, plan justification.

Every pack is hashed (`sha256`) and stored in `artifacts/quality_os/packs/<build_id>/`.
