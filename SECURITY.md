# Security Policy

## Supported Versions

We actively maintain security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < main  | :x:                |

## Reporting a Vulnerability

We take the security of the Titan Trading System seriously. If you believe you have found a security vulnerability, please report it to us as described below.

**Please do not report security vulnerabilities through public GitHub issues.**

### How to Report

1. **Email**: Send a detailed report to **security@peycheff.com**
2. **Subject Line**: Use `[SECURITY] Titan Vulnerability Report` as the subject
3. **Encrypt** (optional): If you need to share sensitive details, request our PGP key

### What to Include

Please include the following information in your report:

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

### What to Expect

- A confirmation email acknowledging receipt of your report
- Regular updates on the progress of addressing the vulnerability
- Credit in our security advisories (unless you prefer to remain anonymous)
- A coordinated disclosure timeline agreed upon with you

## Security Standards

This project adheres to the following security standards:

### Authentication & Authorization
- OAuth 2.1 with PKCE for user authentication
- JWT-based session management with short-lived tokens
- Role-Based Access Control (RBAC) for all operations
- HMAC-SHA256 signed command paths for privileged operations

### Credential Management
- Zero-secret storage in client applications
- AES-256-GCM encryption for credentials at rest
- Immutable audit logging for all credential access
- Automatic key rotation policies

### Infrastructure Security
- All services communicate over encrypted channels (TLS 1.3)
- Container isolation for all microservices
- Network segmentation between trading and control plane components
- Regular security scanning and dependency auditing

### Code Security
- Automated SAST (Static Application Security Testing) in CI
- Dependency vulnerability scanning (npm audit, cargo audit, govulncheck)
- SBOM (Software Bill of Materials) generation
- License compliance verification

## Scope

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

## Disclosure Policy

We follow a coordinated disclosure policy:

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
