# M14 — Security Posture

Reference: [security.md](file:///Users/ivan/Code/work/trading/titan/docs/security.md)

## Threat Model Summary (top threats for this module)
1. **Command injection via git args**: `execSync(`git diff --name-only ${options.base} ${options.head}`)` — args come from hardcoded values (`origin/main`, `HEAD`), not user input. Low risk.
2. **Arbitrary command execution**: SOTA checks in `sota-registry.ts` execute npm scripts — all commands are hardcoded in the registry, not user-supplied. Low risk.
3. **Supply chain compromise**: Module depends on `commander`, `chalk`, `glob` — minimal surface. `npm audit` is run as part of the quality pipeline itself.
4. **Evidence tampering**: Evidence packs include SHA256 hashes (`pack_hash`) for integrity verification. Tampering is detectable.

## NATS ACL Boundaries
N/A — CLI tool, no NATS interaction.

## HMAC Signing Coverage
N/A — Quality OS uses SHA256 hashing for evidence pack integrity, not HMAC signing.
| Boundary | What is Hashed | Verification Point |
|----------|----------------|-------------------|
| Evidence packs | Full pack JSON (sorted keys) | `hashPack()` in `evidence.ts:9-12` |
| SOTA results | SOTA pack contents | `run.ts:172-173` |

## Secrets Handling
| Secret | Storage | Rotation Policy | Fail-Closed? |
|--------|---------|----------------|--------------|
| None | — | — | — |

> Quality OS handles no secrets. It reads source code and produces reports.

## Supply Chain Controls
- `npm audit` + `cargo audit` in CI (this module runs them)
- SBOM generation tracked in `SupplyChainPack`
- GitHub Actions pinning audit via `checkActionPinning()` in `evidence.ts`
- License compliance: `npm run sota:license`

## Exchange Credential Isolation
N/A — Quality OS does not interact with exchanges.
