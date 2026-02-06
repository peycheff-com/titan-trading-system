/**
 * titan_subjects.ts
 *
 * THE SINGLE, AUTHORITATIVE CATALOG OF ALL NATS SUBJECTS IN TITAN.
 *
 * This file replaces all previous catalog files and string literals.
 * Every publisher and subscriber MUST import from here.
 * CI checks strictly enforce that no raw subject strings exist in the codebase.
 *
 * Naming Convention:
 * - titan.cmd.{service}.{action}.v{ver}  -> Commands (Requests)
 * - titan.evt.{service}.{event}.v{ver}   -> Events (Fact broadcasting)
 * - titan.data.{domain}.{type}.v{ver}    -> Data Streams (High volume telemetry)
 * - titan.sys.{scope}.{action}           -> System Control Plane (Heartbeats)
 *
/**
 * Migration Status (Feb 2026):
 * - titan.signal.* is DEPRECATED. Use titan.data.*
 */
export declare const TITAN_SUBJECTS: {
    readonly SIGNAL: {
        readonly SUBMIT: "titan.signal.submit.v1";
    };
    readonly CMD: {
        readonly EXECUTION: {
            /**
             * Place an order
             * Topic: titan.cmd.execution.place.v1.{venue}.{account}.{symbol}
             */
            readonly PLACE: (venue: string, account: string, symbol: string) => string;
            /**
             * Pattern for subscription
             */
            readonly PREFIX: "titan.cmd.execution.place.v1";
            readonly ALL: "titan.cmd.execution.place.v1.>";
        };
        readonly ALL: "titan.cmd.execution.place.v1.>";
        readonly RISK: {
            /**
             * Operator Risk Command (Halt, Flatten, Disarm)
             * Topic: titan.cmd.risk.control.v1
             */
            readonly CONTROL: "titan.cmd.risk.control.v1";
            /**
             * Emergency Flatten Command
             * Topic: titan.cmd.risk.flatten
             */
            readonly FLATTEN: "titan.cmd.risk.flatten";
            /**
             * Update Risk Policy
             * Topic: titan.cmd.risk.policy.v1
             */
            readonly POLICY: "titan.cmd.risk.policy.v1";
        };
        readonly CONFIG: {
            /**
             * Rollback Configuration
             * Topic: titan.cmd.config.rollback
             */
            readonly ROLLBACK: "titan.cmd.config.rollback";
        };
        readonly OPERATOR: {
            /**
             * Arm the system (Enable trading)
             * Topic: titan.cmd.operator.arm.v1
             */
            readonly ARM: "titan.cmd.operator.arm.v1";
            /**
             * Disarm the system (Disable trading)
             * Topic: titan.cmd.operator.disarm.v1
             */
            readonly DISARM: "titan.cmd.operator.disarm.v1";
            readonly ALL: "titan.cmd.operator.v1.>";
        };
        readonly SYS: {
            /**
             * Emergency System Halt (Broadcast)
             * Topic: titan.cmd.sys.halt.v1
             */
            readonly HALT: "titan.cmd.sys.halt.v1";
        };
        readonly HUNTER: {
            /**
             * Direct commands to Hunter
             * Topic: titan.cmd.hunter.v1.>
             */
            readonly ALL: "titan.cmd.hunter.v1.>";
        };
        readonly SENTINEL: {
            /**
             * Direct commands to Sentinel
             * Topic: titan.cmd.sentinel.v1.>
             */
            readonly ALL: "titan.cmd.sentinel.v1.>";
        };
        readonly AI: {
            /**
             * Trigger AI Optimization
             * Topic: titan.cmd.ai.optimize.v1
             */
            readonly OPTIMIZE: "titan.cmd.ai.optimize.v1";
            readonly OPTIMIZE_PROPOSAL: "titan.cmd.ai.optimize.proposal.v1";
            readonly ALL: "titan.cmd.ai.v1.>";
        };
    };
    readonly EVT: {
        readonly ANALYSIS: {
            /**
             * Trade Completion Analysis
             * Topic: titan.evt.analysis.trade_completed.v1
             */
            readonly TRADE_COMPLETED: "titan.evt.analysis.trade_completed.v1";
        };
        readonly ALERT: {
            /**
             * System Alerts
             * Topic: titan.evt.alert.v1
             */
            readonly DRIFT: "titan.evt.alert.drift.v1";
            readonly INTEGRITY: "titan.evt.alert.integrity.v1";
            readonly LATENCY: "titan.evt.alert.latency.v1";
        };
        readonly EXECUTION: {
            /**
             * Fill events
             * Topic: titan.evt.execution.fill.v1.{venue}.{account}.{symbol}
             */
            readonly FILL: "titan.evt.execution.fill.v1";
            /**
             * Shadow Fill events
             * Topic: titan.evt.execution.shadow_fill.v1
             */
            readonly SHADOW_FILL: "titan.evt.execution.shadow_fill.v1";
            /**
             * Execution Reports (Orders, Trades)
             * Topic: titan.evt.execution.report.v1.{venue}.{account}.{symbol}
             */
            readonly REPORT: "titan.evt.exec.report.v1";
            /**
             * Execution Rejections
             * Topic: titan.evt.execution.reject.v1
             */
            readonly REJECT: "titan.evt.execution.reject.v1";
            /**
             * Balance Updates
             * Topic: titan.evt.execution.balance
             */
            readonly BALANCE: "titan.evt.execution.balance";
            /**
             * Truth Snapshot (Periodic State Broadcast)
             * Topic: titan.evt.execution.truth.v1
             */
            readonly TRUTH: "titan.evt.execution.truth.v1";
            readonly ALL: "titan.evt.execution.>";
        };
        readonly SCAVENGER: {
            readonly SIGNAL: "titan.evt.scavenger.signal.v1";
        };
        readonly HUNTER: {
            readonly ALL: "titan.evt.hunter.>";
        };
        readonly SENTINEL: {
            readonly ALL: "titan.evt.sentinel.>";
        };
        readonly POWERLAW: {
            readonly IMPACT: "titan.evt.powerlaw.impact.v1";
            readonly ALL: "titan.evt.powerlaw.>";
        };
        readonly QUANT: {
            readonly ALL: "titan.evt.quant.>";
        };
        readonly PHASE: {
            readonly INTENT: "titan.evt.phase.intent.v1";
            /**
             * Phase Posture/Telemtry
             * titan.evt.phase.posture.v1
             */
            readonly POSTURE: "titan.evt.phase.posture.v1";
            readonly DIAGNOSTICS: "titan.evt.phase.diagnostics.v1";
            readonly ALL: "titan.evt.phase.>";
        };
        readonly BRAIN: {
            readonly SIGNAL: "titan.evt.brain.signal.v1";
            readonly DECISION: "titan.evt.brain.decision.v1";
            readonly REGIME: "titan.evt.brain.regime.v1";
        };
        readonly ANALYTICS: {
            readonly POWERLAW: "titan.evt.analytics.powerlaw.v1";
        };
        readonly BUDGET: {
            readonly UPDATE: "titan.evt.budget.update.v1";
        };
        readonly AUDIT: {
            readonly OPERATOR: "titan.evt.audit.operator.v1";
        };
        readonly RISK: {
            readonly CORRELATION_WARNING: "titan.evt.risk.correlation_warning.v1";
            readonly STATE: "titan.evt.risk.state.v1";
        };
        readonly SYS: {
            readonly FAILOVER_INITIATED: "titan.evt.sys.failover_initiated.v1";
            readonly RESTORE_INITIATED: "titan.evt.sys.restore_initiated.v1";
        };
    };
    readonly DATA: {
        readonly POWERLAW: {
            /**
             * Power Law Metrics
             * Topic: titan.data.powerlaw.metrics.v1.{venue}.{symbol}
             */
            readonly METRICS: (venue: string, symbol: string) => string;
            readonly PREFIX: "titan.data.powerlaw.metrics.v1";
            readonly ALL: "titan.data.powerlaw.metrics.v1.>";
        };
        readonly EXECUTION: {
            /**
             * Execution Constraints (Dynamic Limits)
             * Topic: titan.data.execution.constraints.v1.{venue}.{account}.{symbol}
             */
            readonly CONSTRAINTS: (venue: string, account: string, symbol: string) => string;
            readonly PREFIX: "titan.data.execution.constraints.v1";
            readonly ALL: "titan.data.execution.constraints.v1.>";
        };
        readonly MARKET: {
            readonly TICKER: (venue: string, symbol: string) => string;
            readonly PREFIX: "titan.data.market.ticker.v1";
            readonly ALL: "titan.data.market.ticker.v1.>";
        };
        readonly DASHBOARD: {
            readonly UPDATE: "titan.data.dashboard.update.v1";
        };
        readonly VENUES: {
            /**
             * Venue Status Telemetry (Hunter → Brain)
             * Topic: titan.data.venues.status.v1
             */
            readonly STATUS: "titan.data.venues.status.v1";
            /**
             * Normalized Market Trades (Hunter → Consumers)
             * Topic: titan.data.venues.trades.v1.{venue}.{symbol}
             */
            readonly TRADES: (venue: string, symbol: string) => string;
            readonly TRADES_PREFIX: "titan.data.venues.trades.v1";
            readonly TRADES_ALL: "titan.data.venues.trades.v1.>";
            /**
             * OrderBook Deltas & Snapshots (Hunter → Consumers)
             * Topic: titan.data.venues.orderbooks.v1.{venue}.{symbol}
             */
            readonly ORDERBOOKS: (venue: string, symbol: string) => string;
            readonly ORDERBOOKS_PREFIX: "titan.data.venues.orderbooks.v1";
            readonly ORDERBOOKS_ALL: "titan.data.venues.orderbooks.v1.>";
        };
    };
    readonly SYS: {
        /**
         * Heartbeats
         * Topic: titan.sys.heartbeat.v1.{service}
         */
        readonly HEARTBEAT: (service: string) => string;
        /**
         * Generic RPC / Query namespace (Legacy titan.execution.* pattern)
         * Planning to migrate to titan.sys.rpc.* or similar.
         */
        readonly RPC: {
            readonly GET_POSITIONS: (venue: string) => string;
            readonly GET_BALANCES: (venue: string) => string;
        };
    };
    readonly OPS: {
        readonly COMMAND: "titan.ops.command.v1";
        readonly RECEIPT: "titan.ops.receipt.v1";
        readonly AUDIT: "titan.console.audit.v1";
    };
    readonly DLQ: {
        readonly EXECUTION: "titan.dlq.execution.core";
        readonly SYSTEM: "titan.dlq.system";
        readonly BRAIN: "titan.dlq.brain.processing";
    };
    readonly LEGACY: {
        /** @deprecated Use TITAN_SUBJECTS.DATA.POWERLAW.METRICS */
        readonly SIGNAL_POWERLAW_METRICS_V1: "titan.signal.powerlaw.metrics.v1";
        /** @deprecated Use TITAN_SUBJECTS.DATA.EXECUTION.CONSTRAINTS */
        readonly SIGNAL_EXECUTION_CONSTRAINTS_V1: "titan.signal.execution.constraints.v1";
        /** @deprecated Use TITAN_SUBJECTS.DATA.POWERLAW.ALL */
        readonly SCAVENGER_METRICS_WILDCARD: "powerlaw.metrics.>";
        /** @deprecated Legacy DLQ subject */
        readonly DLQ_EXECUTION_V0: "titan.execution.dlq";
    };
};
/**
 * Migration Helper: Returns both the new and legacy subject for dual-publishing
 */
export declare function getDualPublishSubjects(type: 'METRICS' | 'CONSTRAINTS', ...args: string[]): string[];
//# sourceMappingURL=titan_subjects.d.ts.map