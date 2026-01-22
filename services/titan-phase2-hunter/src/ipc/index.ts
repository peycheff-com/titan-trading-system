/**
 * IPC Module for Hunter Phase
 *
 * Re-exports SignalClient from @titan/shared with Hunter-specific defaults.
 */

export {
  type AbortResponse,
  type ConfirmResponse,
  ConnectionState,
  type IntentSignal,
  type PrepareResponse,
  SignalClient,
  type SignalSource,
} from '@titan/shared';

import { SignalClient, SignalSource } from '@titan/shared';

/**
 * Create a SignalClient configured for Hunter phase
 */
export function createHunterIPCClient(config?: { source?: SignalSource }): SignalClient {
  return new SignalClient({
    source: 'hunter',
  });
}
