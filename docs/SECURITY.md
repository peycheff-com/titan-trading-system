# Security & Compliance

> **Context**: Security Policy & Implementation
> **See Also**: [Risk Policy](risk/risk_policy.md), [Knowledge Graph](knowledge-graph.md)
> **Status**: Canonical
> **Authority**: Titan Security Lead

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < main  | :x:                |

---

## 1. Core Principles

- **Zero Trust**: No service trusts another by default. All NATS traffic is authenticated.
- **Fail-Closed**: If a secret is missing (e.g., `HMAC_SECRET`), the system panic-crashes.
- **Least Privilege**: Services have granular NATS ACLs (e.g., Hunter cannot punish risk).

---

## 2. Authorization & ACLs (NATS)

### Service Identities

Each service has a distinct user in `config/nats.conf`.

| User | Role | Permissions |
| :--- | :--- | :--- |
| `brain` | Orchestrator | Full Access (`>`) |
| `execution` | Motor Control | Sub: `cmd.execution.>`, Pub: `evt.execution.>` |
| `scavenger` | Strategy | Pub: `evt.scavenger.>`, No Risk Control |

### Enforcement

- **Network**: NATS 2.0 Auth (User/Pass + ACLs).
- **Application**: Brain rejects commands from wrong source IDs in envelopes.

---

## 3. Secrets Management

### Critical Secrets

| Secret | Purpose | Rotation Policy |
| :--- | :--- | :--- |
| `HMAC_SECRET` | Signing inter-service commands (Brain <-> Exec) | Quarterly |
| `TITAN_MASTER_PASSWORD` | Operator sudo command authorization | Quarterly |
| `BYBIT_API_KEY` | Exchange access | On-compromise |

### Injection

- Production: Injected via CI/CD into container `.env`.
- Local: `.env` file (gitignored).

---

## 4. Threat Model

### Attack Vectors

1. **Compromised NATS**: Attacker can spoof signals.
    - *Mitigation*: NATS ACLs prevent `hunter` from publishing `titan.cmd.execute`.
2. **Compromised Brain**: Attacker can drain funds.
    - *Mitigation*: Execution-RS RiskGuard (Max Daily Loss) is hard-coded/config-locked.
3. **Supply Chain**: Malicious dependency.
    - *Mitigation*: `npm audit`, `cargo audit`, pinned versions.

---

## 5. Authentication & Authorization Standards

- **JWT Authentication**: Shared secret (HMAC-SHA256).
- **Role-Based Access Control (RBAC)**: All operations require appropriate role.
- **HMAC-SHA256 Signed Commands**: Privileged operations use signed command paths.
- **Future Roadmap**: OAuth 2.1 with PKCE.

### Credential Management

- Zero-secret storage in client applications.
- AES-256-GCM encryption for credentials at rest.
- Immutable audit logging for all credential access.
- Automatic key rotation policies.

### Infrastructure Security

- All services communicate over encrypted channels (TLS 1.3).
- Container isolation for all microservices.
- Network segmentation between trading and control plane components.
- Regular security scanning and dependency auditing.

### Code Security

- Automated SAST (Static Application Security Testing) in CI.
- Dependency vulnerability scanning (`npm audit`, `cargo audit`, `govulncheck`).
- SBOM (Software Bill of Materials) generation.
- License compliance verification.

---

## 6. Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

### How to Report

1. **Email**: Send a detailed report to **security@peycheff.com**
2. **Subject Line**: Use `[SECURITY] Titan Vulnerability Report` as the subject
3. **Encrypt** (optional): If you need to share sensitive details, request our PGP key

### What to Include

- Type of vulnerability (e.g., credential exposure, authentication bypass, injection, etc.)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment of the vulnerability
- Any potential mitigations you've identified

### Response Timeline

| Action | Timeline |
| ------ | -------- |
| Initial acknowledgment | Within 48 hours |
| Initial assessment | Within 7 days |
| Status update | Every 7 days until resolution |
| Fix release | Based on severity (Critical: 24-72h, High: 7 days, Medium: 30 days) |

---

## 7. Scope

### In Scope

- Titan monorepo codebase and all services
- HELM Control Room and Console API
- Trading connectors and venue integrations
- Authentication and credential management systems
- CI/CD pipeline security

### Out of Scope

- Third-party exchange/venue security issues
- Social engineering attacks
- Physical security
- Denial of service attacks (please report, but lower priority)

---

## 8. Disclosure Policy

1. Reporter submits vulnerability
2. We acknowledge and begin investigation
3. We develop and test a fix
4. We coordinate disclosure timing with the reporter
5. We release the fix and publish a security advisory
6. Reporter may publish their findings after the advisory

## Security Updates

Security updates are published via:
- GitHub Security Advisories
- Release notes with `[SECURITY]` tag
- Direct notification to affected users (for critical issues)

---

Thank you for helping keep Titan Trading System and its users secure.
