/**
 * Service Configuration
 */

export interface ServiceConfig {
  // NATS Configuration
  natsUrl: string;
  natsUser?: string;
  natsPass?: string;

  // Processing Configuration
  minSampleSize: number;
  maxHistoryLength: number;
  updateIntervalMs: number;
  staleThresholdMs: number;

  // POT Configuration
  potThresholdMultiplier: number;

  // Health Configuration
  minFitQuality: number;

  // HTTP Server
  httpPort: number;
}

export function loadConfig(): ServiceConfig {
  return {
    natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
    natsUser: process.env.NATS_USER,
    natsPass: process.env.NATS_PASS,

    minSampleSize: parseInt(process.env.MIN_SAMPLE_SIZE || '50', 10),
    maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH || '1000', 10),
    updateIntervalMs: parseInt(process.env.UPDATE_INTERVAL_MS || '5000', 10),
    staleThresholdMs: parseInt(process.env.STALE_THRESHOLD_MS || '60000', 10),

    potThresholdMultiplier: parseFloat(process.env.POT_THRESHOLD_MULTIPLIER || '2.5'),

    minFitQuality: parseFloat(process.env.MIN_FIT_QUALITY || '0.5'),

    httpPort: parseInt(process.env.HTTP_PORT || '8080', 10),
  };
}
