# Start Here: Titan Trading System Documentation

Welcome to the Titan Trading System documentation hub. This guide helps you navigate the system's documentation based on your role and goal.

## 🧭 Navigation by Role

### 🚀 For Developers (Core & Features)
*Build, test, and extend the system.*

1.  **[System Source of Truth](canonical/SYSTEM_SOURCE_OF_TRUTH.md)**: Start here. The authoritative map of ports, services, and invariants.
2.  **[Architecture Overview](ARCHITECTURE.md)**: High-level topology.
3.  **[Local Development Guide](how-to/local_development.md)**: How to run the stack locally.
4.  **[Contributing & Style](CONTRIBUTING.md)**: Coding rules, SOTA gates, and style guide.

### 🛡️ For Operators (Live Environment)
*Deploy, monitor, and manage the organism.*

1.  **[Deployment Guide](DEPLOYMENT.md)**: Production deployment (Manual & Policy).
2.  **[Operations Manual](OPERATIONS.md)**: Monitoring, Secrets, and Self-Hosted AI.
3.  **[Incident Response](runbooks/incident_response.md)**: Emergency procedures.

## By Section

### 📚 [Tutorials](tutorials/index.md)
Learn by doing.
- [Getting Started](tutorials/index.md)

### 🛠️ [How-To Guides](how-to/index.md)
Solve specific problems.
- [Local Development](how-to/local_development.md)
- [Deploy to Production](DEPLOYMENT.md)

### 📖 [Reference](reference/index.md)
Technical details.
- [Canonical Source of Truth](canonical/SYSTEM_SOURCE_OF_TRUTH.md)
- [API Reference](api/README.md)

### 💡 [Explanation](explanation/index.md)
Background and context.
- [Architecture Overview](ARCHITECTURE.md)
- [Execution Routing](explanation/execution-routing.md)
- [HA Strategy](explanation/ha-strategy.md)
- [CI Quality Gates](explanation/ci-quality-gates.md)

### 🔬 For Researchers (Strategy & Verification)
*Backtest, optimize, and audit.*

1.  **[Research Workflow](how-to/research-workflow.md)**: From idea to production signal.
2.  **[Valuation Report](../artifacts/valuation/reports/titan_ip_valuation_report.md)**: System integrity and IP audit.
3.  **[Power Law Lab](../services/titan-powerlaw-lab/README.md)**: Tail risk analysis.
4.  **[Legal & Compliance](explanation/legal-and-compliance.md)**: Risk limits and authorized use.

## 🔑 Key Concepts & Invariants

*   **Canonical Truth**: If `SYSTEM_SOURCE_OF_TRUTH.md` disagrees with another doc, **Source of Truth wins**.
*   **Fail-Closed**: The system defaults to safety (panic on missing secrets, reject on missing signatures).
*   **Zero Drift**: Docs must match code. Run `npm run sota:arch` to verify.

## 📂 Documentation Structure

```
docs/
├── canonical/          # AUTHORITY: The single source of truth.
├── runbooks/           # ACTION: Procedures for incidents and ops.
├── operations/         # KNOWLEDGE: Standards, legal, workflows.
├── architecture/       # DESIGN: Diagrams and decisions.
├── contracts/          # INTERFACES: JSON schemas and API specs.
├── api/                # REFERENCE: OpenAPI specs.
└── archive/            # HISTORY: Deprecated but preserved context.
```

---
*Last Updated: 2026-02-02*
