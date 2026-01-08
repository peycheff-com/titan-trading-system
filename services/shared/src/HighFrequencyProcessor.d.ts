/**
 * High-Frequency Trading Processor for Titan Trading System
 *
 * Provides ultra-low latency signal processing (<10ms) with advanced
 * optimization techniques for high-frequency trading requirements.
 *
 * Requirements: 10.1 - Ultra-low latency signal processing and HFT optimization
 */
import { EventEmitter } from 'eventemitter3';
/**
 * High-frequency signal data structure
 */
export interface HFSignal {
    id: string;
    timestamp: number;
    symbol: string;
    type: 'MARKET_DATA' | 'ORDER_BOOK' | 'TRADE' | 'SIGNAL';
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
    data: {
        price?: number;
        volume?: number;
        side?: 'BUY' | 'SELL';
        orderBookLevel?: number;
        latency?: number;
        [key: string]: any;
    };
    processingMetrics?: {
        receivedAt: number;
        processedAt: number;
        latency: number;
    };
}
/**
 * Processing pipeline stage
 */
export interface ProcessingStage {
    name: string;
    process: (signal: HFSignal) => Promise<HFSignal | null>;
    maxLatency: number;
    enabled: boolean;
}
/**
 * High-frequency processor configuration
 */
export interface HFProcessorConfig {
    maxLatencyMicros: number;
    enableJITOptimization: boolean;
    enableMemoryPooling: boolean;
    enableCPUAffinity: boolean;
    cpuCoreId?: number;
    batchSize: number;
    batchTimeoutMicros: number;
    enableProfiling: boolean;
    enableCircuitBreaker: boolean;
    circuitBreakerThreshold: number;
    priorityQueueSize: number;
    enablePreallocation: boolean;
    preallocatedObjects: number;
}
/**
 * Performance metrics for HFT
 */
export interface HFTMetrics {
    totalSignals: number;
    averageLatencyMicros: number;
    p50LatencyMicros: number;
    p95LatencyMicros: number;
    p99LatencyMicros: number;
    maxLatencyMicros: number;
    signalsPerSecond: number;
    circuitBreakerTrips: number;
    memoryPoolHits: number;
    memoryPoolMisses: number;
    jitOptimizations: number;
    lastResetTime: number;
}
/**
 * High-Frequency Trading Processor
 */
export declare class HighFrequencyProcessor extends EventEmitter {
    private config;
    private processingStages;
    private priorityQueue;
    private memoryPool;
    private jitOptimizer;
    private circuitBreaker;
    private metrics;
    private latencyHistory;
    private isProcessing;
    private processingTimer;
    private batchBuffer;
    private tempResults;
    constructor(config?: Partial<HFProcessorConfig>);
    /**
     * Start high-frequency processing
     */
    start(): void;
    /**
     * Stop high-frequency processing
     */
    stop(): void;
    /**
     * Add processing stage
     */
    addStage(stage: ProcessingStage): void;
    /**
     * Remove processing stage
     */
    removeStage(stageName: string): boolean;
    /**
     * Process signal with ultra-low latency
     */
    processSignal(signal: HFSignal): Promise<void>;
    /**
     * Start batch processing loop
     */
    private startBatchProcessing;
    /**
     * Process batch of signals
     */
    private processBatch;
    /**
     * Get priority value for queue
     */
    private getPriority;
    /**
     * Update latency metrics
     */
    private updateLatencyMetrics;
    /**
     * Get current metrics
     */
    getMetrics(): HFTMetrics;
    /**
     * Get processing statistics
     */
    getProcessingStats(): {
        queueSize: number;
        activeStages: number;
        circuitBreakerState: string;
        jitStats: Record<string, {
            count: number;
            optimized: boolean;
        }>;
        memoryPoolStats: {
            hits: number;
            misses: number;
            poolSize: number;
            hitRate: number;
        };
    };
    /**
     * Reset metrics
     */
    resetMetrics(): void;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<HFProcessorConfig>): void;
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
/**
 * Default high-frequency processor configuration
 */
export declare const DEFAULT_HF_PROCESSOR_CONFIG: HFProcessorConfig;
/**
 * Get or create the global High-Frequency Processor instance
 */
export declare function getHighFrequencyProcessor(config?: Partial<HFProcessorConfig>): HighFrequencyProcessor;
/**
 * Reset the global High-Frequency Processor instance (for testing)
 */
export declare function resetHighFrequencyProcessor(): void;
//# sourceMappingURL=HighFrequencyProcessor.d.ts.map