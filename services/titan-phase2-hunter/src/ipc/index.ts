/**
 * IPC Module for Hunter Phase
 *
 * Re-exports FastPathClient from @titan/shared with Hunter-specific defaults.
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
} from "@titan/shared";

import { FastPathClient } from "@titan/shared";

/**
 * Create a FastPathClient configured for Hunter phase
 */
export function createHunterIPCClient(config?: {
    socketPath?: string;
    hmacSecret?: string;
}): FastPathClient {
    return new FastPathClient({
        source: "hunter",
        socketPath: config?.socketPath,
        hmacSecret: config?.hmacSecret,
    });
}
