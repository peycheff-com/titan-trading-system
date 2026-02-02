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
pub const EVT_EXECUTION_REPORT: &str = "titan.evt.execution.report.v1"; // Verify this exists in TS

// -----------------------------------------------------------------------------
// SUBSCRIPTION PATTERNS (WILDCARDS)
// -----------------------------------------------------------------------------

pub const CMD_WILDCARD: &str = "titan.cmd.>";
pub const CMD_EXEC_WILDCARD: &str = "titan.cmd.execution.>";
pub const CMD_RISK_WILDCARD: &str = "titan.cmd.risk.>";
