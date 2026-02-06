# Incident Response Protocol

> **Status**: Canonical
> **Policy**: Stop the Line

## 1. Severity Levels

| Level | Definition | Response Time | Example |
| :--- | :--- | :--- | :--- |
| **SEV-1 (CRITICAL)** | Capital at risk. Trading Halted. | Immediate | Exchange API disconnect while in position; Truth Drift; Host compromise. |
| **SEV-2 (HIGH)** | Core function degraded. Trading Paused. | < 15 mins | History sync failing; Strategy latency spiking. |
| **SEV-3 (LOW)** | Non-critical bug. Trading continues. | Next day | UI glitch; Logging noise. |

## 2. Response Procedures

### 2.1 The Kill Switch (SEV-1)
**ANY** Operator is authorized to hit the Kill Switch if they suspect a SEV-1. "Better safe than sorry."

```bash
docker exec titan-nats nats pub titan.cmd.risk.halt.v1 '{"reason":"Incident SEV1","auth":"operator"}'
```

### 2.2 Investigation
1.  **Isolate**: If it's a security breach, cut network info.
2.  **Diagnose**: Check `titan-brain` logs for "PANIC" or "REJECT".
3.  **Status Page**: Update internal status (Slack/Discord).

## 3. Post-Incident
Every SEV-1 and SEV-2 requires a **Post-Mortem** within 24 hours.

### Post-Mortem Template
- **Summary**: What happened?
- **Timeline**: Detection -> Mitigation -> Resolution.
- **Root Cause**: The technical "Why".
- **Corrective Actions**: (Jira tickets).
    - [ ] Fix the bug.
    - [ ] Add the test case (Regression prevention).
    - [ ] Update documentation.
