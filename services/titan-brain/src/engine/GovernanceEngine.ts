import { Logger } from '../logging/Logger.js';
import { EventEmitter } from 'events';

export enum DefconLevel {
  NORMAL = 'NORMAL', // 1.0x Leverage, All Strategies Active
  CAUTION = 'CAUTION', // 0.8x Leverage, No New Hunter Positions
  DEFENSIVE = 'DEFENSIVE', // 0.5x Leverage, Sentinel Only (Reduce Only others)
  EMERGENCY = 'EMERGENCY', // 0.0x Leverage, Liquidate All (Kill Switch)
}

export interface SystemHealth {
  latency_ms: number;
  error_rate_5m: number; // 0-1
  drawdown_pct: number; // 0-100
}

export class GovernanceEngine extends EventEmitter {
  private logger: Logger;
  private currentLevel: DefconLevel = DefconLevel.NORMAL;
  private overrideLevel: DefconLevel | null = null;

  // Thresholds
  private readonly LATENCY_THRESHOLD_MS = 1000; // 1s
  private readonly ERROR_RATE_THRESHOLD = 0.05; // 5%
  private readonly MAX_DRAWDOWN_CAUTION = 5.0; // 5%
  private readonly MAX_DRAWDOWN_DEFENSIVE = 10.0; // 10%
  private readonly MAX_DRAWDOWN_EMERGENCY = 15.0; // 15%

  constructor() {
    super();
    this.logger = Logger.getInstance('governance-engine');
    this.logger.info('🏛️ Governance Engine Initialized (DEFCON: NORMAL)');
  }

  public getDefconLevel(): DefconLevel {
    return this.overrideLevel || this.currentLevel;
  }

  public setOverride(level: DefconLevel | null) {
    this.overrideLevel = level;
    this.logger.warn(`Manual Override: ${level || 'CLEARED'}`);
    this.emit('defcon_change', this.getDefconLevel());
  }

  public updateHealth(health: SystemHealth) {
    const calculatedLevel = this.calculateDefcon(health);

    if (calculatedLevel !== this.currentLevel) {
      this.logger.warn(
        `DEFCON Level Changed: ${this.currentLevel} -> ${calculatedLevel}`,
        undefined,
        { health },
      );
      this.currentLevel = calculatedLevel;
      this.emit('defcon_change', this.getDefconLevel());
    }
  }

  private calculateDefcon(health: SystemHealth): DefconLevel {
    // 1. Emergency Checks
    if (health.drawdown_pct >= this.MAX_DRAWDOWN_EMERGENCY) {
      return DefconLevel.EMERGENCY;
    }
    if (health.error_rate_5m > 0.2) return DefconLevel.EMERGENCY; // >20% errors

    // 2. Defensive Checks
    if (health.drawdown_pct >= this.MAX_DRAWDOWN_DEFENSIVE) {
      return DefconLevel.DEFENSIVE;
    }
    if (health.latency_ms > this.LATENCY_THRESHOLD_MS) {
      return DefconLevel.DEFENSIVE;
    }
    if (health.error_rate_5m > this.ERROR_RATE_THRESHOLD) {
      return DefconLevel.DEFENSIVE;
    }

    // 3. Caution Checks
    if (health.drawdown_pct >= this.MAX_DRAWDOWN_CAUTION) {
      return DefconLevel.CAUTION;
    }
    if (health.latency_ms > 300) return DefconLevel.CAUTION;

    return DefconLevel.NORMAL;
  }

  public getLeverageMultiplier(): number {
    switch (this.getDefconLevel()) {
      case DefconLevel.NORMAL:
        return 1.0;
      case DefconLevel.CAUTION:
        return 0.8;
      case DefconLevel.DEFENSIVE:
        return 0.5;
      case DefconLevel.EMERGENCY:
        return 0.0;
      default:
        return 0.0;
    }
  }

  public canOpenNewPosition(phaseId: string): boolean {
    const level = this.getDefconLevel();

    if (level === DefconLevel.EMERGENCY) return false;

    if (level === DefconLevel.DEFENSIVE) {
      // Only Sentinel (Phase 3) allows open in Defensive
      return phaseId === 'phase3';
    }

    if (level === DefconLevel.CAUTION) {
      // Hunter (Phase 2) paused in Caution
      return phaseId !== 'phase2';
    }

    return true;
  }
}
