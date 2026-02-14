# Titan Trading System Documentation

**Version:** 2030 Standard
**Status:** Canonical

## 🧠 Core System Truth (Start Here)

These documents form the immutable foundation of the system.

- [**system-source-of-truth.md**](system-source-of-truth.md) — **The Bible**. If code disagrees with this doc, code is wrong (or this doc is stale).
- [**ai-readme.md**](ai-readme.md) — **🤖 AGENTS START HERE**. Zero-shot context and navigation instructions.
- [**knowledge-graph.md**](knowledge-graph.md) — Map of Concepts <-> Code.
- [**architecture.md**](architecture.md) — High-level organism design, data flow, and "Bio-Mimetic" principles.
- [**security.md**](security.md) — AuthZ, Secrets, Threat Model (Panic-on-miss).

## 💡 Concepts & Guides

- [**High Availability**](explanation/ha-strategy.md) — Strategy for 99.99% uptime.
- [**Execution Routing**](explanation/execution-routing.md) — How orders reach the exchange.
- [**Quality Gates**](dev/quality-gates.md) — CI/CD standards.
- [**Legal**](explanation/legal-and-compliance.md) — Compliance notes.

## 🛠 Operations & Deployment

How to run, deploy, and keep it alive.

- [**OPERATIONS**](operations/README.md) — Dashboards, Metrics, Monitoring, Troubleshooting.
- [**deployment-standard.md**](deployment-standard.md) — The "Dull Standard" for prod. Docker Compose specs.
- [**PROVISIONING**](operations/digitalocean/00_create_droplet.md) — DigitalOcean infrastructure setup.
- [**RUNBOOKS**](runbooks/README.md) — "When X happens, do Y". Incident response procedure.

## 📚 References & Specifications

Deep dives into specific components.

- [**REFERENCE**](reference/README.md) — API specs, NATS subject maps, Schema catalogs.
- [**CONTRACTS**](contracts/README.md) — Immutable data contracts and interface definitions.
- [**DESIGN SYSTEM**](design-system/master.md) — UI/UX principles and component library.
- [**TLA+ SPECS**](specs/tla/README.md) — Formal verification models.


## 🧩 Component Documentation

For deeper implementation details, see local READMEs:

### 🧠 Core Services
- **Brain**: [titan-brain.md](components/titan-brain.md)
- **Execution**: [titan-execution-rs.md](components/titan-execution-rs.md)
- **Shared Lib**: [shared.md](components/shared.md)

### 🕵️ Strategy Phase Services (The "Organs")
- **Phase 1: Scavenger**: [titan-phase1-scavenger.md](components/titan-phase1-scavenger.md)
- **Phase 2: Hunter**: [titan-phase2-hunter.md](components/titan-phase2-hunter.md)
- **Phase 3: Sentinel**: [titan-phase3-sentinel.md](components/titan-phase3-sentinel.md)

### 🧪 Labs & Support
- **PowerLaw Lab**: [titan-powerlaw-lab.md](components/titan-powerlaw-lab.md)
- **AI Quant**: [titan-ai-quant.md](components/titan-ai-quant.md)
- **Ops Daemon**: [titan-opsd.md](components/titan-opsd.md)
- **Console API**: [titan-console-api.md](components/titan-console-api.md)

### 🖥️ Frontend
- **Console**: [titan-console.md](components/titan-console.md)

## 🏗️ Development & Contribution

- [**Contribution Guide**](contributing.md) — How to propose changes.
- [**Repo Structure**](dev/repo_structure.md) — Where does code live?
- [**Testing Strategy**](dev/testing_and_ci.md) — How to run tests.
- [**Integration Verification**](dev/integration-verification.md) — End-to-end verification.
- [**Configuration**](dev/configuration.md) — Environment variables guide.

## 🛡️ Risk & Security

- [**Risk Policy**](risk/risk_policy.md) — The mathematical laws of safety.
- [**Circuit Breakers**](risk/circuit_breakers.md) — Automated shutoff thresholds.
- [**Redis Security**](setup/redis-security.md) — securing the cache.
- [**Infrastructure Setup**](setup/infrastructure.md) — Provisioning guide.

## 🏛️ Architecture & RFCs

- [**Decision Loop**](organism/brain_decision_loop.md) — How the Brain thinks.
- [**Execution Engine**](organism/execution_engine.md) — Rust-based execution.
- [**Research**](research/ai_quant_pipeline.md) — AI Model implementation.
- [**Alpha Workflow**](research/workflow.md) — How to add new alpha.
- [**RFCs**](rfcs/004_execution_hot_standby.md) — Request for Comments.
- [**Connectivity Demo**](connectivity/local-demo.md) — Connection verification.
- [**Phases**](organism/phases.md) — Strategy phase breakdown.

## 🚀 Launch & CI

- [**Launch Checklist**](launch/checklist.md) — Go-live procedure.
- [**Branch Protection**](ci/branch_protection.md) — Git rules.

## 🔗 Connectivity & Topology

- [**Schemas**](connectivity/schemas.md) — Data structure definitions.
- [**NATS Topology**](connectivity/nats-topology.md) — Event bus graph.

---

