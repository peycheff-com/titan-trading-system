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

export const TITAN_SUBJECTS = {
  // ===========================================================================
  // 0. SIGNALS (titan.signal.*)
  // Legacy flow being preserved.
  // ===========================================================================
  SIGNAL: {
    SUBMIT: 'titan.signal.submit.v1',
  },
  // ===========================================================================
  // 1. COMMANDS (titan.cmd.*)
  // Request for action. Expects side-effects.
  // ===========================================================================

  CMD: {
    EXECUTION: {
      /**
       * Place an order
       * Topic: titan.cmd.execution.place.v1.{venue}.{account}.{symbol}
       */
      PLACE: (venue: string, account: string, symbol: string) =>
        `titan.cmd.execution.place.v1.${venue}.${account}.${symbol}`,

      /**
       * Pattern for subscription
       */
      PREFIX: 'titan.cmd.execution.place.v1',
      ALL: 'titan.cmd.execution.place.v1.>',
    },
    ALL: 'titan.cmd.execution.place.v1.>',

    RISK: {
      /**
       * Operator Risk Command (Halt, Flatten, Disarm)
       * Topic: titan.cmd.risk.control.v1
       */
      CONTROL: 'titan.cmd.risk.control.v1',

      /**
       * Emergency Flatten Command
       * Topic: titan.cmd.risk.flatten
       */
      FLATTEN: 'titan.cmd.risk.flatten',

      /**
       * Update Risk Policy
       * Topic: titan.cmd.risk.policy.v1
       */
      POLICY: 'titan.cmd.risk.policy.v1',
    },

    CONFIG: {
      /**
       * Rollback Configuration
       * Topic: titan.cmd.config.rollback
       */
      ROLLBACK: 'titan.cmd.config.rollback',
    },

    OPERATOR: {
      /**
       * Arm the system (Enable trading)
       * Topic: titan.cmd.operator.arm.v1
       */
      ARM: 'titan.cmd.operator.arm.v1',

      /**
       * Disarm the system (Disable trading)
       * Topic: titan.cmd.operator.disarm.v1
       */
      DISARM: 'titan.cmd.operator.disarm.v1',
      ALL: 'titan.cmd.operator.v1.>',
    },

    SYS: {
      /**
       * Emergency System Halt (Broadcast)
       * Topic: titan.cmd.sys.halt.v1
       */
      HALT: 'titan.cmd.sys.halt.v1',
    },

    HUNTER: {
      /**
       * Direct commands to Hunter
       * Topic: titan.cmd.hunter.v1.>
       */
      ALL: 'titan.cmd.hunter.v1.>',
    },

    SENTINEL: {
      /**
       * Direct commands to Sentinel
       * Topic: titan.cmd.sentinel.v1.>
       */
      ALL: 'titan.cmd.sentinel.v1.>',
    },

    AI: {
      /**
       * Trigger AI Optimization
       * Topic: titan.cmd.ai.optimize.v1
       */
      OPTIMIZE: 'titan.cmd.ai.optimize.v1',
      OPTIMIZE_PROPOSAL: 'titan.cmd.ai.optimize.proposal.v1',
      ALL: 'titan.cmd.ai.v1.>',
    },
  },

  // ===========================================================================
  // 2. EVENTS (titan.evt.*)
  // Facts that happened. Immutable history.
  // ===========================================================================

  EVT: {
    ANALYSIS: {
      /**
       * Trade Completion Analysis
       * Topic: titan.evt.analysis.trade_completed.v1
       */
      TRADE_COMPLETED: 'titan.evt.analysis.trade_completed.v1',
    },

    ALERT: {
      /**
       * System Alerts
       * Topic: titan.evt.alert.v1
       */
      DRIFT: 'titan.evt.alert.drift.v1',
      INTEGRITY: 'titan.evt.alert.integrity.v1',
      LATENCY: 'titan.evt.alert.latency.v1',
    },

    EXECUTION: {
      /**
       * Fill events
       * Topic: titan.evt.execution.fill.v1.{venue}.{account}.{symbol}
       */
      FILL: 'titan.evt.execution.fill.v1',
      /**
       * Shadow Fill events
       * Topic: titan.evt.execution.shadow_fill.v1
       */
      SHADOW_FILL: 'titan.evt.execution.shadow_fill.v1',
      /**
       * Execution Reports (Orders, Trades)
       * Topic: titan.evt.execution.report.v1.{venue}.{account}.{symbol}
       */
      REPORT: 'titan.evt.exec.report.v1',
      /**
       * Execution Rejections
       * Topic: titan.evt.execution.reject.v1
       */
      REJECT: 'titan.evt.execution.reject.v1',
      /**
       * Balance Updates
       * Topic: titan.evt.execution.balance
       */
      BALANCE: 'titan.evt.execution.balance',
      ALL: 'titan.evt.execution.>',
    },

    // Strategy/Phase Signals (Events that trigger intent)
    // Note: These were historically "signals", now formalized as Events

    SCAVENGER: {
      SIGNAL: 'titan.evt.scavenger.signal.v1',
    },

    HUNTER: {
      ALL: 'titan.evt.hunter.>',
    },

    SENTINEL: {
      ALL: 'titan.evt.sentinel.>',
    },

    POWERLAW: {
      IMPACT: 'titan.evt.powerlaw.impact.v1',
      ALL: 'titan.evt.powerlaw.>',
    },

    QUANT: {
      ALL: 'titan.evt.quant.>',
    },

    PHASE: {
      INTENT: 'titan.evt.phase.intent.v1',
      /**
       * Phase Posture/Telemtry
       * titan.evt.phase.posture.v1
       */
      POSTURE: 'titan.evt.phase.posture.v1',
      DIAGNOSTICS: 'titan.evt.phase.diagnostics.v1',
      ALL: 'titan.evt.phase.>',
    },

    BRAIN: {
      SIGNAL: 'titan.evt.brain.signal.v1',
      REGIME: 'titan.evt.brain.regime.v1',
    },

    ANALYTICS: {
      POWERLAW: 'titan.evt.analytics.powerlaw.v1',
    },

    BUDGET: {
      UPDATE: 'titan.evt.budget.update.v1',
    },

    AUDIT: {
      OPERATOR: 'titan.evt.audit.operator.v1',
    },

    RISK: {
      CORRELATION_WARNING: 'titan.evt.risk.correlation_warning.v1',
      STATE: 'titan.evt.risk.state.v1',
    },

    SYS: {
      FAILOVER_INITIATED: 'titan.evt.sys.failover_initiated.v1',
      RESTORE_INITIATED: 'titan.evt.sys.restore_initiated.v1',
    },
  },

  // ===========================================================================
  // 3. DATA (titan.data.*)
  // High-frequency streams, metrics, market data.
  // ===========================================================================

  DATA: {
    POWERLAW: {
      /**
       * Power Law Metrics
       * Topic: titan.data.powerlaw.metrics.v1.{venue}.{symbol}
       */
      METRICS: (venue: string, symbol: string) =>
        `titan.data.powerlaw.metrics.v1.${venue}.${symbol}`,
      PREFIX: 'titan.data.powerlaw.metrics.v1',
      ALL: 'titan.data.powerlaw.metrics.v1.>',
    },

    EXECUTION: {
      /**
       * Execution Constraints (Dynamic Limits)
       * Topic: titan.data.execution.constraints.v1.{venue}.{account}.{symbol}
       */
      CONSTRAINTS: (venue: string, account: string, symbol: string) =>
        `titan.data.execution.constraints.v1.${venue}.${account}.${symbol}`,
      PREFIX: 'titan.data.execution.constraints.v1',
      ALL: 'titan.data.execution.constraints.v1.>',
    },

    MARKET: {
      TICKER: (venue: string, symbol: string) => `titan.data.market.ticker.v1.${venue}.${symbol}`,
      PREFIX: 'titan.data.market.ticker.v1',
      ALL: 'titan.data.market.ticker.v1.>',
    },

    DASHBOARD: {
      UPDATE: 'titan.data.dashboard.update.v1',
    },
  },

  // ===========================================================================
  // 4. SYSTEM (titan.sys.*)
  // Control plane, heartbeats, configuration.
  // ===========================================================================

  SYS: {
    /**
     * Heartbeats
     * Topic: titan.sys.heartbeat.v1.{service}
     */
    HEARTBEAT: (service: string) => `titan.sys.heartbeat.v1.${service}`,

    /**
     * Generic RPC / Query namespace (Legacy titan.execution.* pattern)
     * Planning to migrate to titan.sys.rpc.* or similar.
     */
    RPC: {
      GET_POSITIONS: (venue: string) => `titan.execution.get_positions.${venue}`,
      GET_BALANCES: (venue: string) => `titan.execution.get_balances.${venue}`,
    },
  },

  // ===========================================================================
  // 5. DLQ (titan.dlq.*)
  // Dead Letter Queues for failed processing
  // ===========================================================================
  DLQ: {
    EXECUTION: 'titan.dlq.execution.core',
    SYSTEM: 'titan.dlq.system',
    BRAIN: 'titan.dlq.brain.processing',
  },

  // ===========================================================================
  // 6. LEGACY / DEPRECATED (Quarantined)
  // These will be removed after migration deadline.
  // ===========================================================================
  LEGACY: {
    /** @deprecated Use TITAN_SUBJECTS.DATA.POWERLAW.METRICS */
    SIGNAL_POWERLAW_METRICS_V1: 'titan.signal.powerlaw.metrics.v1',

    /** @deprecated Use TITAN_SUBJECTS.DATA.EXECUTION.CONSTRAINTS */
    SIGNAL_EXECUTION_CONSTRAINTS_V1: 'titan.signal.execution.constraints.v1',

    /** @deprecated Use TITAN_SUBJECTS.DATA.POWERLAW.ALL */
    SCAVENGER_METRICS_WILDCARD: 'powerlaw.metrics.>',

    /** @deprecated Legacy DLQ subject */
    DLQ_EXECUTION_V0: 'titan.execution.dlq',
  },
} as const;

/**
 * Migration Helper: Returns both the new and legacy subject for dual-publishing
 */
export function getDualPublishSubjects(
  type: 'METRICS' | 'CONSTRAINTS',
  ...args: string[]
): string[] {
  if (type === 'METRICS') {
    const [venue, symbol] = args;
    return [
      TITAN_SUBJECTS.DATA.POWERLAW.METRICS(venue, symbol),
      `${TITAN_SUBJECTS.LEGACY.SIGNAL_POWERLAW_METRICS_V1}.${venue}.${symbol}`,
    ];
  }
  if (type === 'CONSTRAINTS') {
    const [venue, account, symbol] = args;
    return [
      TITAN_SUBJECTS.DATA.EXECUTION.CONSTRAINTS(venue, account, symbol),
      `${TITAN_SUBJECTS.LEGACY.SIGNAL_EXECUTION_CONSTRAINTS_V1}.${venue}.${account}.${symbol}`,
    ];
  }
  return [];
}
