# M08P — Security Posture

Reference: [security.md](file:///Users/ivan/Code/work/trading/titan/docs/security.md)

## Threat Model Summary (top threats for this module)
1. <!-- -->

## NATS ACL Boundaries
- Service identity: <!-- -->
- Trust zone: <!-- Full Access / Publish-only / Subscribe-only -->

## HMAC Signing Coverage
| Boundary | What is Signed | Verification Point |
|----------|----------------|-------------------|
| <!-- --> | <!-- --> | <!-- --> |

## Secrets Handling
| Secret | Storage | Rotation Policy | Fail-Closed? |
|--------|---------|----------------|--------------|
| <!-- --> | `.env` / Vault | <!-- --> | yes/no |

## Supply Chain Controls
- `npm audit` + `cargo audit` in CI
- SBOM generation
- License compliance: `npm run sota:license`

## Exchange Credential Isolation
| Control | Mechanism |
|---------|-----------|
| API key scope | Trade-only (no withdrawal) |
| IP whitelist | Production VPS IPs only |
