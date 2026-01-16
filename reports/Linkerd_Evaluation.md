# Linkerd Service Mesh Evaluation for Titan

## Executive Summary

**Recommendation: Not applicable for current Railway deployment**

Linkerd is a Kubernetes-native service mesh that requires direct access to a
Kubernetes cluster. Titan currently deploys on Railway, a Platform-as-a-Service
(PaaS) that abstracts Kubernetes. Linkerd cannot be installed on Railway's
managed infrastructure.

---

## Linkerd Overview

### What It Is

Linkerd is a lightweight, Rust-based service mesh for Kubernetes that provides:

| Feature                | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| **mTLS**               | Automatic mutual TLS encryption between all services |
| **Observability**      | Metrics, logs, traces without code changes           |
| **Reliability**        | Retries, timeouts, circuit breaking, rate limiting   |
| **Traffic Management** | Dynamic routing, load balancing, traffic shifting    |
| **Security**           | Post-quantum TLS (ML-KEM-768), FIPS 140-3 compliance |

### Latest Version (2.19 - October 2025)

- Post-quantum key exchange algorithms by default
- Native Kubernetes sidecar support (beta)
- Windows container support
- New on-cluster dashboard with TLS/FIPS auditing
- Enhanced multicluster federation

---

## Titan Architecture Analysis

### Current Deployment

```
Railway PaaS (Managed Infrastructure)
├── Titan Brain (Node.js/Fastify)
├── Titan Execution (Deprecated - Node.js)
├── Titan Execution RS (Rust)
├── Titan Console (React/Vite)
├── Titan AI Quant (Node.js)
├── Titan Hunter (Node.js)
├── Titan Sentinel (Node.js)
└── Titan Scavenger (Node.js)
```

### Communication Patterns

| Path                          | Protocol                 | Current Security |
| ----------------------------- | ------------------------ | ---------------- |
| Console → Brain               | HTTPS                    | TLS via Railway  |
| Brain → Execution RS          | NATS                     | NATS TLS         |
| Phase Services → Execution RS | Unix Domain Socket (IPC) | HMAC signing     |
| Brain → AI Quant              | NATS                     | NATS TLS         |

---

## Compatibility Assessment

### ❌ Railway PaaS Limitations

Railway does **not** expose Kubernetes cluster access:

1. **No DaemonSet support** - Linkerd control plane cannot be installed
2. **No sidecar injection** - Cannot inject Linkerd proxies into pods
3. **No CRD access** - Cannot deploy Linkerd's custom resources
4. **No NetworkPolicy** - Cannot configure Linkerd's network rules

### ✅ If Migrating to Kubernetes

If Titan migrates to a Kubernetes-based platform (e.g., GKE, EKS, AKS,
DigitalOcean):

| Benefit              | Value for Titan                                  |
| -------------------- | ------------------------------------------------ |
| **Automatic mTLS**   | All inter-service traffic encrypted              |
| **Observability**    | Latency dashboards, golden metrics               |
| **Circuit Breaking** | Protect execution engine from cascading failures |
| **Rate Limiting**    | Prevent signal storms from overwhelming Brain    |
| **Multicluster**     | Deploy Brain/Execution across regions            |

---

## Alternative Approaches for Railway

Since Linkerd isn't applicable, consider these alternatives for Titan:

### 1. NATS JetStream (Already Implemented ✅)

Currently provides:

- Reliable pub/sub messaging
- At-least-once delivery
- Stream persistence

### 2. Application-Level mTLS

If stronger inter-service security is needed:

- Use `node:tls` module for HTTPS between services
- Rotate certificates via Railway secrets

### 3. Railway Private Networking

Railway offers private networking between services:

- Internal DNS for service-to-service calls
- Not exposed to public internet

### 4. Future: Kubernetes Migration

If scalability demands require Kubernetes:

| Platform                    | Recommendation                    |
| --------------------------- | --------------------------------- |
| **DigitalOcean Kubernetes** | Low cost, simple                  |
| **GKE Autopilot**           | Fully managed, Linkerd compatible |
| **Northflank**              | Railway-like UX on K8s            |

---

## Conclusion

| Question                                 | Answer                               |
| ---------------------------------------- | ------------------------------------ |
| Is Linkerd compatible with Railway?      | ❌ No                                |
| Does Titan need Linkerd now?             | ❌ No - Current security is adequate |
| Should Titan consider Linkerd in future? | ✅ Yes - If migrating to Kubernetes  |

### Current Security Posture

Titan already has:

- ✅ HMAC signing on IPC (FastPathClient)
- ✅ NATS TLS for messaging
- ✅ Railway's built-in TLS termination
- ✅ Environment-based secrets management

### When to Reconsider

Revisit Linkerd when:

1. Migrating from Railway to Kubernetes
2. Deploying across multiple regions/clusters
3. Requiring regulatory compliance (FIPS 140-3)
4. Needing advanced traffic management (canary, A/B testing)
