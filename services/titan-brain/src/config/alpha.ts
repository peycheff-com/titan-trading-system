import { TitanBrainConfig } from '../types/config.js';
import { defaultConfig } from './defaults.js';
import { EquityTier } from '../types/allocation.js';

export const alphaConfig: Partial<TitanBrainConfig> = {
  brain: {
    ...defaultConfig.brain,
    initialCapital: 1000, // Safe play money start
  },
  riskGuardian: {
    ...defaultConfig.riskGuardian,
    maxCorrelation: 0.6, // Stricter for alpha
    minStopDistanceMultiplier: 3.0, // Wider stops to avoid noise
  },
  circuitBreaker: {
    ...defaultConfig.circuitBreaker,
    maxDailyDrawdown: 0.05, // 5% max daily loss tight leash
    minEquity: 800, // Stop if we lose 20%
  },
  allocationEngine: {
    ...defaultConfig.allocationEngine,
    leverageCaps: {
      [EquityTier.MICRO]: 2, // Very low leverage for testing
      [EquityTier.SMALL]: 2,
      [EquityTier.MEDIUM]: 2,
      [EquityTier.LARGE]: 1,
      [EquityTier.INSTITUTIONAL]: 1,
    },
  },
  // Ensure notifications are off or directed to dev
  notifications: {
    telegram: { enabled: false },
    email: { enabled: false },
  },
  // Explicitly set execution URL to undefined (should default to mock/log if correctly implemented)
  services: {
    executionUrl: undefined,
  },
};
