/**
 * IPC Module for Sentinel Phase
 *
 * Re-exports FastPathClient from @titan/shared with Sentinel-specific defaults.
 */

export {
  type AbortResponse,
  type ConfirmResponse,
  ConnectionState,
  FastPathClient,
  type IntentSignal,
  type IPCClientConfig,
  type IPCMetrics,
  type PrepareResponse,
  type SignalSource,
} from '@titan/shared';

import { FastPathClient } from '@titan/shared';

/**
 * Create a FastPathClient configured for Sentinel phase
 */
export function createSentinelIPCClient(config?: {
  socketPath?: string;
  hmacSecret?: string;
}): FastPathClient {
  return new FastPathClient({
    source: 'sentinel',
    socketPath: config?.socketPath,
    hmacSecret: config?.hmacSecret,
  });
}
