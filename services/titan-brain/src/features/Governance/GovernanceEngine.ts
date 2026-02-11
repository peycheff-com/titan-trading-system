/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
import { Logger } from '../../logging/Logger.js';
import { EventEmitter } from 'events';
import { DefconLevel, SystemHealth } from './types.js';
import { calculateDefconLevel, canOpenPosition, getLeverageMultiplier } from './logic.js';

export { DefconLevel, SystemHealth } from './types.js';

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
    return calculateDefconLevel(health);
  }

  public getLeverageMultiplier(): number {
    return getLeverageMultiplier(this.getDefconLevel());
  }

  public canOpenNewPosition(phaseId: string): boolean {
    return canOpenPosition(this.getDefconLevel(), phaseId);
  }
}
