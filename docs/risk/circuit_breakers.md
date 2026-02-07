# Circuit Breakers & Kill Switches

> **Status**: Canonical
> **Mechanism**: State Machine in `titan-execution-rs`

## 1. Risk States

The system operates in one of 4 states. Transitions are one-way (downward) during a trading session, requiring operator intervention to reset (upward).

| State | Trigger | Effect |
| :--- | :--- | :--- |
| 🟢 **NORMAL** | Default | Full limits apply. |
| 🟡 **CAUTIOUS** | Drawdown > 50% of Limit | Position Sizing = 0.5x. |
| 🟠 **DEFENSIVE** | Drawdown > 75% of Limit | **No New Positions**. Reduce Only. |
| 🔴 **EMERGENCY** | Drawdown > 99% OR `HALT` Cmd | **Flatten All**. Cancel All. |

## 2. Triggers

### 2.1 Daily Drawdown
- Monitored by Brain.
- If Equity drops below `StartingEquity - MaxDailyLoss`, a `CMD.RISK.HALT` is fired.

### 2.2 Truth Collapse (Drift)
- Monitored by Reconciliation Loop.
- If `|LocalPos - RemotePos| > Tolerance`, the system enters **EMERGENCY**.

### 2.3 Sentinel Failure
- If `titan-phase3-sentinel` stops emitting heartbeats (> 10s), Brain triggers **DEFENSIVE**.

## 3. Operator Controls

### 3.1 The Big Red Button (HALT)
Manual override to kill the system.
```bash
# Via NATS (from Host)
docker exec titan-nats nats pub titan.cmd.sys.halt.v1 '{"state":"HARD_HALT","reason":"Manual","timestamp":12345}'
```
**Effect**:
- Cancels all open orders.
- Closes all positions (Market).
- Rejects all future commands.

### 3.2 Reset / Re-Arm
To return to `NORMAL` state, an Operator must sign an Arm command.

```bash
./scripts/ops/set_trading_mode.sh arm "Post-incident re-arm" "<operator_id>"
```
**Prerequisite**:
- Root cause resolved.
- Operator manually reviewed logs.
