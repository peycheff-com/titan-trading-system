# 01 Current SOTA:ALL Baseline Report

**Run Date**: 2026-02-06
**Exit Code**: 1 (Failed)

## Summary
The baseline `npm run sota:all` run completed with failures in the dependency audit step due to known vulnerabilities.

## Gate Results

| Gate | Status | Notes |
|------|--------|-------|
| `sota:circular` | ✅ PASS | No circular dependencies |
| `sota:arch` | ✅ PASS | Architecture boundaries clean |
| `sota:complexity` | ✅ PASS | Complexity within limits |
| `sota:god` | ✅ PASS | No god classes detected |
| `sota:dead` | ✅ PASS | Dead code scan clean |
| `sota:zombie` | ✅ PASS | No zombie code |
| `sota:secrets` | ✅ PASS | No secrets in codebase |
| `sota:immutability` | ✅ PASS | Immutability rules enforced |
| `sota:audit` | ⚠️ WARN | 2 high severity vulnerabilities |
| `sota:license` | ✅ PASS | Licenses compliant |
| `sota:bundle` | ✅ PASS | Bundle sizes within limits |
| `sota:correctness` | ✅ PASS | Correctness tests pass |
| `sota:typecheck` | ✅ PASS | TypeScript compilation clean |
| `sota:deps` | ⚠️ WARN | Same vulnerabilities as audit |
| `sota:rust:*` | ✅ PASS | Rust toolchain checks pass |
| `sota:perf` | ✅ PASS | Placeholder (no regression) |
| `sota:db` | ✅ PASS | Migration checks pass |
| `sota:unit` | ✅ PASS | Unit tests pass |
| `sota:docs:all` | ✅ PASS | Documentation valid |

## Vulnerabilities Found

1. **@isaacs/brace-expansion 5.0.0** - High severity
   - Uncontrolled Resource Consumption
   - Fix: `npm audit fix`

2. **@modelcontextprotocol/sdk 1.10.0-1.25.3** - High severity  
   - Cross-client data leak
   - Fix: `npm audit fix`

## Remediation Required
- Run `npm audit fix` to resolve known vulnerabilities
- Both issues are auto-fixable
