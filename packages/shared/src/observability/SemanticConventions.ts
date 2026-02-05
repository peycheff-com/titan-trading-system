/**
 * Semantic Conventions for Titan Trading System
 * Adheres to OpenTelemetry usage where possible.
 */

export const TITAN_SEMANTICS = {
  // --- Service Identity ---
  SERVICE_NAME: 'service.name',
  SERVICE_VERSION: 'service.version',
  DEPLOYMENT_ENVIRONMENT: 'deployment.environment', // 'production', 'staging', 'dev'

  // --- Titan Core ---
  TITAN_PHASE: 'titan.phase', // 'strategy', 'execution', 'analysis'
  TITAN_STRATEGY: 'titan.strategy',
  TITAN_ACCOUNT: 'titan.account',
  TITAN_USER: 'titan.user',

  // --- Signal & Execution ---
  SIGNAL_CONFIDENCE: 'titan.signal.confidence',
  SIGNAL_ID: 'titan.signal.id',
  ORDER_ID: 'titan.order.id',
  ORDER_SIDE: 'titan.order.side',
  ORDER_SYMBOL: 'titan.order.symbol',
  ORDER_VENUE: 'titan.order.venue',

  // --- System ---
  MEMORY_USAGE: 'system.memory.usage',
  CPU_USAGE: 'system.cpu.usage',
  EVENT_LOOP_LAG: 'system.event_loop_lag',
} as const;
