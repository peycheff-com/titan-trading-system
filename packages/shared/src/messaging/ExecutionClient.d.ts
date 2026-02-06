import { AbortResponse, ConfirmResponse, ConnectionState, IntentSignal, PrepareResponse, SignalSource } from '../ipc/index.js';
import { EventEmitter } from 'eventemitter3';
export declare class ExecutionClient extends EventEmitter {
    private nats;
    private pendingSignals;
    private source;
    constructor(config: {
        source: SignalSource;
    });
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getConnectionState(): ConnectionState;
    sendPrepare(signal: IntentSignal): Promise<PrepareResponse>;
    sendConfirm(signal_id: string): Promise<ConfirmResponse>;
    sendAbort(signal_id: string): Promise<AbortResponse>;
    private publishDlq;
    getMetrics(): any;
    getStatus(): any;
    forceReconnect(): Promise<void>;
}
//# sourceMappingURL=ExecutionClient.d.ts.map