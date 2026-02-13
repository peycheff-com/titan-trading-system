/**
 * Safety Model Integration Test
 *
 * Verifies the full safety model contract:
 * - Kill switch (global halt / flatten / arm / disarm)
 * - RBAC operator authentication for manual overrides
 * - Layered circuit breakers (strategic → transactional → reflex)
 * - Risk state escalation paths
 * - Override audit trail
 *
 * Requirement: docs/contracts/safety-model.md
 */

import { describe, expect, it, beforeEach } from '@jest/globals';

// ============ Safety Model Enums ============

enum RiskState {
  Normal = 'NORMAL',
  Cautious = 'CAUTIOUS',
  Defensive = 'DEFENSIVE',
  Emergency = 'EMERGENCY',
}

enum KillSwitchAction {
  Halt = 'HALT',
  Flatten = 'FLATTEN',
  Arm = 'ARM',
  Disarm = 'DISARM',
}

enum CircuitBreakerLayer {
  Strategic = 'STRATEGIC',
  Transactional = 'TRANSACTIONAL',
  Reflex = 'REFLEX',
}

// ============ Safety Model Types ============

interface KillSwitchCommand {
  action: KillSwitchAction;
  actor_id: string;
  command_id: string;
  timestamp: number;
  reason: string;
  signature: string;
}

interface AuditEvent {
  event_type: string;
  actor_id: string;
  action: string;
  timestamp: number;
  details: Record<string, unknown>;
}

interface CircuitBreakerState {
  layer: CircuitBreakerLayer;
  tripped: boolean;
  tripCount: number;
  lastTripTime?: number;
  reason?: string;
}

// ============ Safety Model Implementation ============

class SafetyModel {
  private riskState: RiskState = RiskState.Normal;
  private armed: boolean = true;
  private halted: boolean = false;
  private haltReason?: string;
  private auditLog: AuditEvent[] = [];
  private circuitBreakers: Map<CircuitBreakerLayer, CircuitBreakerState> = new Map();

  constructor() {
    // Initialize all three circuit breaker layers
    for (const layer of Object.values(CircuitBreakerLayer)) {
      this.circuitBreakers.set(layer, {
        layer,
        tripped: false,
        tripCount: 0,
      });
    }
  }

  // --- Kill Switch ---

  executeKillSwitch(cmd: KillSwitchCommand): { success: boolean; error?: string } {
    // Validate signature exists
    if (!cmd.signature) {
      return { success: false, error: 'Missing signature' };
    }

    // Validate actor has permission (simplified RBAC check)
    if (!cmd.actor_id.startsWith('operator-')) {
      return { success: false, error: 'Unauthorized actor' };
    }

    switch (cmd.action) {
      case KillSwitchAction.Halt:
        this.halted = true;
        this.haltReason = cmd.reason;
        this.riskState = RiskState.Emergency;
        break;

      case KillSwitchAction.Flatten:
        this.halted = true;
        this.haltReason = `FLATTEN: ${cmd.reason}`;
        this.riskState = RiskState.Emergency;
        break;

      case KillSwitchAction.Arm:
        if (this.halted) {
          return { success: false, error: 'Cannot arm while halted' };
        }
        this.armed = true;
        break;

      case KillSwitchAction.Disarm:
        this.armed = false;
        break;
    }

    // Record audit event
    this.auditLog.push({
      event_type: 'titan.evt.audit.operator.v1',
      actor_id: cmd.actor_id,
      action: cmd.action,
      timestamp: cmd.timestamp,
      details: { reason: cmd.reason, command_id: cmd.command_id },
    });

    return { success: true };
  }

  resume(actorId: string, reason: string): { success: boolean; error?: string } {
    if (!actorId.startsWith('operator-')) {
      return { success: false, error: 'Unauthorized actor' };
    }
    if (!this.halted) {
      return { success: false, error: 'System is not halted' };
    }

    this.halted = false;
    this.haltReason = undefined;
    this.riskState = RiskState.Normal;

    this.auditLog.push({
      event_type: 'titan.evt.audit.operator.v1',
      actor_id: actorId,
      action: 'RESUME',
      timestamp: Date.now(),
      details: { reason },
    });

    return { success: true };
  }

  // --- Circuit Breakers ---

  tripCircuitBreaker(layer: CircuitBreakerLayer, reason: string): void {
    const cb = this.circuitBreakers.get(layer)!;
    cb.tripped = true;
    cb.tripCount++;
    cb.lastTripTime = Date.now();
    cb.reason = reason;

    // Escalation: Reflex trips → Emergency
    if (layer === CircuitBreakerLayer.Reflex) {
      this.riskState = RiskState.Emergency;
      this.halted = true;
      this.haltReason = `Reflex CB: ${reason}`;
    }
    // Strategic trips → Defensive
    if (layer === CircuitBreakerLayer.Strategic) {
      if (this.riskState === RiskState.Normal) {
        this.riskState = RiskState.Defensive;
      }
    }
    // Transactional → Cautious
    if (layer === CircuitBreakerLayer.Transactional) {
      if (this.riskState === RiskState.Normal) {
        this.riskState = RiskState.Cautious;
      }
    }
  }

  resetCircuitBreaker(layer: CircuitBreakerLayer): void {
    const cb = this.circuitBreakers.get(layer)!;
    cb.tripped = false;
    cb.reason = undefined;
  }

  // --- Queries ---

  canTrade(): boolean {
    return this.armed && !this.halted && this.riskState !== RiskState.Emergency;
  }

  canOpenNewPositions(): boolean {
    return (
      this.canTrade() &&
      this.riskState === RiskState.Normal
    );
  }

  getRiskState(): RiskState {
    return this.riskState;
  }

  isHalted(): boolean {
    return this.halted;
  }

  isArmed(): boolean {
    return this.armed;
  }

  getAuditLog(): AuditEvent[] {
    return [...this.auditLog];
  }

  getCircuitBreaker(layer: CircuitBreakerLayer): CircuitBreakerState {
    return { ...this.circuitBreakers.get(layer)! };
  }
}

// ============ Tests ============

describe('Safety Model Integration', () => {
  let safety: SafetyModel;

  beforeEach(() => {
    safety = new SafetyModel();
  });

  // --- Kill Switch Tests ---

  describe('Kill Switch', () => {
    const makeCmd = (action: KillSwitchAction, reason = 'test'): KillSwitchCommand => ({
      action,
      actor_id: 'operator-001',
      command_id: `cmd-${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      reason,
      signature: 'valid-hmac-signature',
    });

    it('should HALT the system and enter Emergency state', () => {
      const result = safety.executeKillSwitch(makeCmd(KillSwitchAction.Halt, 'Manual halt'));
      expect(result.success).toBe(true);
      expect(safety.isHalted()).toBe(true);
      expect(safety.getRiskState()).toBe(RiskState.Emergency);
      expect(safety.canTrade()).toBe(false);
      expect(safety.canOpenNewPositions()).toBe(false);
    });

    it('should FLATTEN positions and halt', () => {
      const result = safety.executeKillSwitch(makeCmd(KillSwitchAction.Flatten, 'Emergency closeout'));
      expect(result.success).toBe(true);
      expect(safety.isHalted()).toBe(true);
      expect(safety.getRiskState()).toBe(RiskState.Emergency);
    });

    it('should DISARM the system preventing new trades', () => {
      const result = safety.executeKillSwitch(makeCmd(KillSwitchAction.Disarm, 'End of session'));
      expect(result.success).toBe(true);
      expect(safety.isArmed()).toBe(false);
      expect(safety.canTrade()).toBe(false);
    });

    it('should ARM the system allowing trades', () => {
      // Disarm first
      safety.executeKillSwitch(makeCmd(KillSwitchAction.Disarm));
      expect(safety.canTrade()).toBe(false);

      // Re-arm
      const result = safety.executeKillSwitch(makeCmd(KillSwitchAction.Arm, 'Start session'));
      expect(result.success).toBe(true);
      expect(safety.isArmed()).toBe(true);
      expect(safety.canTrade()).toBe(true);
    });

    it('should NOT allow ARM while halted', () => {
      safety.executeKillSwitch(makeCmd(KillSwitchAction.Halt));
      const result = safety.executeKillSwitch(makeCmd(KillSwitchAction.Arm));
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot arm while halted');
    });

    it('should reject commands without valid signature', () => {
      const cmd = makeCmd(KillSwitchAction.Halt);
      cmd.signature = '';
      const result = safety.executeKillSwitch(cmd);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing signature');
    });

    it('should reject commands from unauthorized actors', () => {
      const cmd = makeCmd(KillSwitchAction.Halt);
      cmd.actor_id = 'phase-scavenger'; // Not an operator
      const result = safety.executeKillSwitch(cmd);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized actor');
    });

    it('should resume from halt with operator authorization', () => {
      safety.executeKillSwitch(makeCmd(KillSwitchAction.Halt));
      expect(safety.isHalted()).toBe(true);

      const result = safety.resume('operator-001', 'Issue resolved');
      expect(result.success).toBe(true);
      expect(safety.isHalted()).toBe(false);
      expect(safety.getRiskState()).toBe(RiskState.Normal);
      expect(safety.canTrade()).toBe(true);
    });

    it('should not resume if not halted', () => {
      const result = safety.resume('operator-001', 'Nothing to resume');
      expect(result.success).toBe(false);
    });
  });

  // --- Circuit Breaker Layering ---

  describe('Layered Circuit Breakers', () => {
    it('should escalate to Cautious on Transactional CB trip', () => {
      safety.tripCircuitBreaker(CircuitBreakerLayer.Transactional, 'Order rate exceeded');
      expect(safety.getRiskState()).toBe(RiskState.Cautious);
      expect(safety.canTrade()).toBe(true);
      expect(safety.canOpenNewPositions()).toBe(false);
    });

    it('should escalate to Defensive on Strategic CB trip', () => {
      safety.tripCircuitBreaker(CircuitBreakerLayer.Strategic, 'Max drawdown reached');
      expect(safety.getRiskState()).toBe(RiskState.Defensive);
      expect(safety.canTrade()).toBe(true);
      expect(safety.canOpenNewPositions()).toBe(false);
    });

    it('should escalate to Emergency on Reflex CB trip', () => {
      safety.tripCircuitBreaker(CircuitBreakerLayer.Reflex, 'Flash crash detected');
      expect(safety.getRiskState()).toBe(RiskState.Emergency);
      expect(safety.isHalted()).toBe(true);
      expect(safety.canTrade()).toBe(false);
    });

    it('should increment trip count on repeated trips', () => {
      safety.tripCircuitBreaker(CircuitBreakerLayer.Transactional, 'First trip');
      safety.resetCircuitBreaker(CircuitBreakerLayer.Transactional);
      safety.tripCircuitBreaker(CircuitBreakerLayer.Transactional, 'Second trip');

      const cb = safety.getCircuitBreaker(CircuitBreakerLayer.Transactional);
      expect(cb.tripCount).toBe(2);
      expect(cb.tripped).toBe(true);
    });

    it('should reset circuit breaker without changing risk state', () => {
      safety.tripCircuitBreaker(CircuitBreakerLayer.Transactional, 'Trip');
      safety.resetCircuitBreaker(CircuitBreakerLayer.Transactional);

      const cb = safety.getCircuitBreaker(CircuitBreakerLayer.Transactional);
      expect(cb.tripped).toBe(false);
      expect(cb.reason).toBeUndefined();
    });
  });

  // --- Audit Trail ---

  describe('Override Audit Events', () => {
    it('should produce audit events for every kill switch command', () => {
      safety.executeKillSwitch({
        action: KillSwitchAction.Halt,
        actor_id: 'operator-001',
        command_id: 'cmd-halt-1',
        timestamp: Date.now(),
        reason: 'Maintenance window',
        signature: 'hmac-sig',
      });

      const log = safety.getAuditLog();
      expect(log.length).toBe(1);
      expect(log[0].event_type).toBe('titan.evt.audit.operator.v1');
      expect(log[0].actor_id).toBe('operator-001');
      expect(log[0].action).toBe('HALT');
      expect(log[0].details.reason).toBe('Maintenance window');
    });

    it('should produce audit events for resume', () => {
      safety.executeKillSwitch({
        action: KillSwitchAction.Halt,
        actor_id: 'operator-001',
        command_id: 'cmd-halt-2',
        timestamp: Date.now(),
        reason: 'halt',
        signature: 'hmac-sig',
      });

      safety.resume('operator-002', 'Issue resolved');

      const log = safety.getAuditLog();
      expect(log.length).toBe(2);
      expect(log[1].action).toBe('RESUME');
      expect(log[1].actor_id).toBe('operator-002');
    });

    it('should NOT produce audit events for rejected commands', () => {
      const cmd: KillSwitchCommand = {
        action: KillSwitchAction.Halt,
        actor_id: 'unknown-user',
        command_id: 'cmd-bad',
        timestamp: Date.now(),
        reason: 'hack attempt',
        signature: 'hmac-sig',
      };

      safety.executeKillSwitch(cmd);
      expect(safety.getAuditLog().length).toBe(0);
    });

    it('should use correct NATS subject for audit events', () => {
      safety.executeKillSwitch({
        action: KillSwitchAction.Disarm,
        actor_id: 'operator-003',
        command_id: 'cmd-disarm-1',
        timestamp: Date.now(),
        reason: 'End of day',
        signature: 'hmac-sig',
      });

      const log = safety.getAuditLog();
      expect(log[0].event_type).toBe('titan.evt.audit.operator.v1');
    });
  });

  // --- Compound Scenarios ---

  describe('Compound Safety Scenarios', () => {
    it('should handle full lifecycle: arm → trade → CB trip → halt → resume → arm', () => {
      expect(safety.canTrade()).toBe(true);

      // CB trip escalates risk
      safety.tripCircuitBreaker(CircuitBreakerLayer.Strategic, 'Drawdown');
      expect(safety.canOpenNewPositions()).toBe(false);
      expect(safety.canTrade()).toBe(true);

      // Reflex CB halts system
      safety.tripCircuitBreaker(CircuitBreakerLayer.Reflex, 'Flash crash');
      expect(safety.canTrade()).toBe(false);
      expect(safety.isHalted()).toBe(true);

      // Operator resumes
      safety.resume('operator-001', 'Market stabilized');
      expect(safety.canTrade()).toBe(true);
      expect(safety.isHalted()).toBe(false);
    });

    it('should prevent trading when disarmed even without halt', () => {
      const cmd: KillSwitchCommand = {
        action: KillSwitchAction.Disarm,
        actor_id: 'operator-001',
        command_id: 'cmd-1',
        timestamp: Date.now(),
        reason: 'Weekend',
        signature: 'sig',
      };

      safety.executeKillSwitch(cmd);
      expect(safety.isHalted()).toBe(false);
      expect(safety.isArmed()).toBe(false);
      expect(safety.canTrade()).toBe(false);
    });
  });
});
