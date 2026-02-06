# Titan Threat Model

> **Status**: Canonical
> **Focus**: Adversarial Risk Analysis

## 1. Assets & Adversaries

### 1.1 Critical Assets
1.  **Capital (Exchange Balances)**: The primary target.
2.  **Private Keys (API Keys, SSH)**: Access to capital.
3.  **Strategy IP**: The logic and signals (Alpha).
4.  **Reputation**: The "Identity" of the organism.

### 1.2 Adversaries
1.  **External Hackers**: Seeking to steal API keys or manipulate orders.
2.  **Malicious Insiders**: Operators with excess privilege.
3.  **The Exchange itself**: Seeking to liquidate positions (Adversarial venue).
4.  **The System itself**: Bugs leading to fast liquidation (The "Drift" enemy).

## 2. Attack Surfaces

### 2.1 Network (Ingress)
- **Vectors**: SSH Port (22), HTTPS (443).
- **Mitigation**:
  - DigitalOcean Cloud Firewall (Whitelisted IPs only for SSH).
  - Traefik Reverse Proxy for HTTP.
  - **Invariant**: Brain/Execution ports (3100/3002) are NEVER exposed publicly.

### 2.2 Supply Chain
- **Vectors**: NIST Vulnerabilities in dependencies, malicious NPM packages.
- **Mitigation**:
  - `knip` analysis in CI.
  - Locked `package-lock.json`.
  - Minimal container images (Alpine).

### 2.3 Signal Injection
- **Vectors**: Injecting fake signals to trigger bad trades.
- **Mitigation**:
  - **HMAC Signatures**: Brain execution commands MUST be signed.
  - **Timestamps**: Replay protection (max 5s drift).
  - **NATS ACLs**: `scavenger` CANNOT publish to `titan.cmd.execution.*`.

## 3. Defense in Depth

### 3.1 The "Fail-Closed" Principle
If a security check fails (e.g., missing signature, weird timestamp), the system **Halts**. It never "guesses" or "allows".

### 3.2 HMAC Signing Layer
All Inter-Process Communication (IPC) that carries financial consequence is signed with `HMAC-SHA256`.
- **Key**: `HMAC_SECRET` (Env var).
- **Enforcement**: Wiring check at startup. Panic if missing.

### 3.3 NATS Access Control Lists (ACL)
We do not use a flat namespace.
- **User `brain`**: Full Access.
- **User `execution`**: Can Publish Fills, Subscribe Commands. CANNOT Publish Commands.
- **User `scavenger`**: Can Publish Signals. CANNOT Publish Commands.

## 4. Residual Risks
1.  **Exchange Account Compromise**: If API keys leak, we rely on Exchange-side IP whitelisting.
2.  **Social Engineering**: Phishing operator for SSH keys. (Mitigation: YubiKey/Hardware MFA for SSH).
