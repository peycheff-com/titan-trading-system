// Canonical Subject Catalog for Rust Services
// Mirrors packages/shared/src/messaging/titan_subjects.ts
// This file is the Source of Truth for subject strings in Rust.

// -----------------------------------------------------------------------------
// COMMANDS
// -----------------------------------------------------------------------------

// System Control
pub const CMD_SYS_HALT: &str = "titan.cmd.sys.halt.v1";

// Risk Control
pub const CMD_RISK_CONTROL: &str = "titan.cmd.risk.control.v1";
pub const CMD_RISK_FLATTEN: &str = "titan.cmd.risk.flatten";
pub const CMD_RISK_POLICY: &str = "titan.cmd.risk.policy.v1";

// Operator Control
pub const CMD_OPERATOR_ARM: &str = "titan.cmd.operator.arm.v1";
pub const CMD_OPERATOR_DISARM: &str = "titan.cmd.operator.disarm.v1";

// Execution Intent
pub const CMD_EXECUTION_PLACE_PREFIX: &str = "titan.cmd.execution.place.v1";

// -----------------------------------------------------------------------------
// EVENTS
// -----------------------------------------------------------------------------

pub const EVT_EXECUTION_FILL: &str = "titan.evt.execution.fill.v1";
pub const EVT_EXECUTION_SHADOW_FILL: &str = "titan.evt.execution.shadow_fill.v1";
pub const EVT_EXECUTION_REPORT: &str = "titan.evt.execution.report.v1";
pub const EVT_EXECUTION_TRADE_CLOSED: &str = "titan.evt.analysis.trade_completed.v1"; // Mapped to canonical subject
pub const EVT_EXECUTION_FUNDING: &str = "titan.evt.execution.funding.v1"; // Need to add to TS if not present
pub const EVT_EXECUTION_BALANCE: &str = "titan.evt.execution.balance";
pub const EVT_EXECUTION_REJECT: &str = "titan.evt.execution.reject.v1";
pub const EVT_EXECUTION_TRUTH: &str = "titan.evt.execution.truth.v1";

// -----------------------------------------------------------------------------
// SUBSCRIPTION PATTERNS (WILDCARDS)
// -----------------------------------------------------------------------------

pub const CMD_WILDCARD: &str = "titan.cmd.>";
pub const CMD_EXEC_WILDCARD: &str = "titan.cmd.execution.>";
pub const CMD_RISK_WILDCARD: &str = "titan.cmd.risk.>";
pub const EVT_WILDCARD: &str = "titan.evt.>";

// DATA
pub const DATA_MARKET_TICKER_PREFIX: &str = "titan.data.market.ticker.v1.>";

// RPC / REQUESTS
pub const RPC_GET_POSITIONS_PREFIX: &str = "titan.rpc.execution.get_positions.v1.>";
pub const RPC_GET_BALANCES_PREFIX: &str = "titan.rpc.execution.get_balances.v1.>";
pub const REQ_POLICY_HASH: &str = "titan.req.exec.policy_hash.v1";

// SYSTEM EVENTS
pub const EVT_SYS_HEARTBEAT: &str = "titan.evt.system.heartbeat"; // TODO: Migrate to titan.sys.heartbeat.v1
pub const EVT_RISK_STATE: &str = "titan.evt.risk.state"; // TODO: Migrate to titan.evt.risk.state.v1

// LEGACY / COMPATIBILITY
pub const LEGACY_SIGNAL_CONSTRAINTS_PREFIX: &str = "titan.signal.execution.constraints.v1.>";
pub const LEGACY_DLQ_EXECUTION: &str = "titan.execution.dlq";

// DLQ
pub const DLQ_EXECUTION_CORE: &str = "titan.dlq.execution.core";
