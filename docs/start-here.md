# Start Here: Titan Trading System Documentation

Welcome to the Titan Trading System documentation hub. This guide helps you navigate the system's documentation based on your role and goal.

## 🧭 Navigation by Role

### 🚀 For Developers (Core & Features)

*Build, test, and extend the system.*

1. **[System Source of Truth](system-source-of-truth.md)**: Start here. The authoritative map of ports, services, and invariants.
2. **[Architecture Overview](architecture.md)**: High-level topology.
3. **[Repo Structure](dev/repo_structure.md)**: Where does code live?
4. **[Contributing & Style](contributing.md)**: Coding rules, SOTA gates, and style guide.

### 🛡️ For Operators (Live Environment)

*Deploy, monitor, and manage the organism.*

1. **[Deployment Guide](deployment-standard.md)**: Production deployment (Manual & Policy).
2. **[Operations Manual](operations/README.md)**: Monitoring, Secrets, and Self-Hosted AI.
3. **[Incident Response](operations/troubleshooting/incident-response.md)**: Emergency procedures.

## By Section

### 📚 [Reference](reference/README.md)

Technical details.

- [Canonical Source of Truth](system-source-of-truth.md)
- [API Reference](reference/README.md)

### 💡 Explanation

Background and context.

- [Architecture Overview](architecture.md)
- [Execution Routing](explanation/execution-routing.md)
- [HA Strategy](explanation/ha-strategy.md)
- [Quality Gates](dev/quality-gates.md)

### 🔬 For Researchers (Strategy & Verification)

*Backtest, optimize, and audit.*

1. **[Research Workflow](research/workflow.md)**: From idea to production signal.
2. **Valuation Report**: System integrity and IP audit. (Coming Soon)
3. **[Power Law Lab](components/titan-powerlaw-lab.md)**: Tail risk analysis.
4. **[Legal & Compliance](explanation/legal-and-compliance.md)**: Risk limits and authorized use.

## 🔑 Key Concepts & Invariants

- **Canonical Truth**: If `system-source-of-truth.md` disagrees with another doc, **Source of Truth wins**.
- **Fail-Closed**: The system defaults to safety (panic on missing secrets, reject on missing signatures).
- **Zero Drift**: Docs must match code. Run `npm run sota:arch` to verify.
- **Evidence First**: Claims must be backed by file paths or command outputs.

## 📂 Documentation Structure

```text
docs/
├── components/         # Component documentation (services, packages, apps).
├── runbooks/           # ACTION: Procedures for incidents and ops.
├── operations/         # KNOWLEDGE: Standards, legal, workflows.
├── architecture/       # DESIGN: Diagrams and decisions.
├── contracts/          # INTERFACES: JSON schemas and API specs.
├── reference/          # REFERENCE: API specs, NATS subjects, schemas.
└── setup/              # SETUP: Infrastructure provisioning guides.
```

---
> Last Updated: 2026-02-14
