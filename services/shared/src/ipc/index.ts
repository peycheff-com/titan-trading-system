/**
 * IPC Module - Fast Path Communication
 *
 * Provides Unix Domain Socket IPC client for sub-millisecond
 * communication with the Rust execution engine.
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
} from "./FastPathClient.js";
