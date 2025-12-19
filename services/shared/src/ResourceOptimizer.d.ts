/**
 * Resource Optimizer for Titan Trading System
 *
 * Provides memory usage monitoring, garbage collection tuning,
 * resource usage alerting, and performance benchmarking.
 *
 * Requirements: 5.4 - Memory and resource optimization
 */
import { EventEmitter } from 'eventemitter3';
/**
 * Memory usage statistics
 */
export interface MemoryStats {
    heapUsed: number;
    heapTotal: number;
    heapLimit: number;
    external: number;
    rss: number;
    arrayBuffers: number;
    heapUsagePercent: number;
    gcCount: number;
    gcDuration: number;
}
/**
 * CPU usage statistics
 */
export interface CPUStats {
    user: number;
    system: number;
    total: number;
    loadAverage: number[];
    cpuUsagePercent: number;
}
/**
 * Resource usage thresholds
 */
export interface ResourceThresholds {
    memoryWarning: number;
    memoryCritical: number;
    cpuWarning: number;
    cpuCritical: number;
    heapWarning: number;
    heapCritical: number;
}
/**
 * Performance benchmark result
 */
export interface BenchmarkResult {
    name: string;
    duration: number;
    memoryBefore: MemoryStats;
    memoryAfter: MemoryStats;
    memoryDelta: number;
    timestamp: number;
}
/**
 * Garbage collection statistics
 */
interface GCStats {
    count: number;
    totalDuration: number;
    averageDuration: number;
    lastGC: number;
    type: string;
}
/**
 * Resource Optimizer
 */
export declare class ResourceOptimizer extends EventEmitter {
    private monitoringInterval;
    private gcObserver;
    private thresholds;
    private gcStats;
    private benchmarks;
    private lastCPUUsage;
    private lastCPUTime;
    private resourceHistory;
    constructor(thresholds?: Partial<ResourceThresholds>);
    /**
     * Start resource monitoring
     */
    startMonitoring(intervalMs?: number): void;
    /**
     * Stop resource monitoring
     */
    stopMonitoring(): void;
    /**
     * Get current memory statistics
     */
    getMemoryStats(): MemoryStats;
    /**
     * Get current CPU statistics
     */
    getCPUStats(): CPUStats;
    /**
     * Force garbage collection (if --expose-gc flag is used)
     */
    forceGarbageCollection(): boolean;
    /**
     * Optimize garbage collection settings
     */
    private optimizeGarbageCollection;
    /**
     * Setup garbage collection monitoring
     */
    private setupGCMonitoring;
    /**
     * Track garbage collection event
     */
    private trackGCEvent;
    /**
     * Collect and analyze resource metrics
     */
    private collectResourceMetrics;
    /**
     * Check resource thresholds and emit alerts
     */
    private checkResourceThresholds;
    /**
     * Run performance benchmark
     */
    benchmark(name: string, fn: () => Promise<any> | any): Promise<BenchmarkResult>;
    /**
     * Get resource usage history
     */
    getResourceHistory(): Array<{
        timestamp: number;
        memory: MemoryStats;
        cpu: CPUStats;
    }>;
    /**
     * Get garbage collection statistics
     */
    getGCStats(): Record<string, GCStats>;
    /**
     * Get benchmark results
     */
    getBenchmarks(): BenchmarkResult[];
    /**
     * Get resource usage summary
     */
    getResourceSummary(): {
        memory: MemoryStats;
        cpu: CPUStats;
        gc: Record<string, GCStats>;
        uptime: number;
        nodeVersion: string;
        v8Version: string;
    };
    /**
     * Optimize memory usage
     */
    optimizeMemory(): void;
    /**
     * Set resource thresholds
     */
    setThresholds(thresholds: Partial<ResourceThresholds>): void;
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
/**
 * Get or create the global Resource Optimizer instance
 */
export declare function getResourceOptimizer(thresholds?: Partial<ResourceThresholds>): ResourceOptimizer;
/**
 * Reset the global Resource Optimizer instance (for testing)
 */
export declare function resetResourceOptimizer(): void;
export {};
//# sourceMappingURL=ResourceOptimizer.d.ts.map