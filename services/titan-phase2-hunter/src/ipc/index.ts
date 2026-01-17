/**
 * IPC Module for Hunter Phase
 *
 * Re-exports ExecutionClient from @titan/shared with Hunter-specific defaults.
 */

export {
    type AbortResponse,
    type ConfirmResponse,
    ConnectionState,
    ExecutionClient,
    type IntentSignal,
    type PrepareResponse,
    type SignalSource,
} from "@titan/shared";

import { ExecutionClient, SignalSource } from "@titan/shared";

/**
 * Create a ExecutionClient configured for Hunter phase
 */
export function createHunterIPCClient(config?: {
    source?: SignalSource;
}): ExecutionClient {
    return new ExecutionClient({
        source: "hunter",
    });
}
