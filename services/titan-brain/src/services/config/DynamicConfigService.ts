import { Logger } from '../../logging/Logger.js';
import { createHash } from 'crypto';

// Basic interface for a resolved configuration value
export interface ResolvedConfig<T> {
  value: T;
  versionId: number;
  isCanary: boolean;
}

interface CanaryRollout {
  id: number;
  parameter_name: string;
  active_version_id: number;
  active_value: any;
  baseline_version_id: number;
  baseline_value: any;
  rollout_percentage: number;
  target_criteria?: Record<string, any>;
}

export class DynamicConfigService {
  private logger: Logger;
  private activeRollouts: Map<string, CanaryRollout> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.logger = Logger.getInstance('dynamic-config');
  }

  async start(): Promise<void> {
    this.logger.info('Starting Dynamic Config Service...');
    await this.refreshConfigs();

    // Poll for updates every minute
    // eslint-disable-next-line functional/immutable-data
    this.refreshInterval = setInterval(() => {
      this.refreshConfigs().catch((err) => {
        this.logger.error('Failed to refresh configs', err);
      });
    }, 60000);
  }

  async stop(): Promise<void> {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  /**
   * Get configuration for a specific context (Signal)
   * Uses consistent hashing to ensure stability
   */
  getConfig<T>(
    parameterName: string,
    signalId: string,
    context: any = {},
  ): ResolvedConfig<T> | null {
    const rollout = this.activeRollouts.get(parameterName);

    // If no dynamic rollout, return null (caller uses static default)
    if (!rollout) {
      return null;
    }

    // Check target criteria (filtering)
    if (rollout.target_criteria) {
      const match = Object.entries(rollout.target_criteria).every(([key, val]) => {
        return context[key] === val;
      });
      if (!match) {
        // Fallback to baseline if criteria doesn't match
        return {
          value: rollout.baseline_value,
          versionId: rollout.baseline_version_id,
          isCanary: false,
        };
      }
    }

    // Consistent Hashing: hash(signalId + parameterName) % 100
    const hash = createHash('sha256').update(`${signalId}:${parameterName}`).digest('hex');

    // Use first 8 chars (32 bits) for sufficient randomness
    const intVal = parseInt(hash.substring(0, 8), 16);
    const normalized = intVal % 100;

    if (normalized < rollout.rollout_percentage) {
      // User falls into Canary bucket
      return {
        value: rollout.active_value,
        versionId: rollout.active_version_id,
        isCanary: true,
      };
    } else {
      // User falls into Baseline bucket
      return {
        value: rollout.baseline_value,
        versionId: rollout.baseline_version_id,
        isCanary: false,
      };
    }
  }

  private async refreshConfigs(): Promise<void> {
    try {
      // TODO: Replace with actual DB call using shared DB instance
      // For now, mocking the DB fetch to avoid dependency complexity in this step
      // const rollouts = await db.query("SELECT ...");
      // MOCK DATA
      // this.activeRollouts.set('risk_limit', ...);
      // this.logger.debug("Refreshed dynamic configs", undefined, { count: this.activeRollouts.size });
    } catch (e) {
      this.logger.error('Error refreshing dynamic configs', e as Error);
    }
  }

  // Method to allow mocking in tests/manual injection
  public setRollout(name: string, rollout: CanaryRollout) {
    // eslint-disable-next-line functional/immutable-data
    this.activeRollouts.set(name, rollout);
  }
}
