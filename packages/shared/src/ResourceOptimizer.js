/**
 * Resource Optimizer for Titan Trading System
 *
 * Provides memory usage monitoring, garbage collection tuning,
 * resource usage alerting, and performance benchmarking.
 *
 * Requirements: 5.4 - Memory and resource optimization
 */
import { EventEmitter } from 'eventemitter3';
import { performance, PerformanceObserver } from 'perf_hooks';
import * as v8 from 'v8';
import * as process from 'process';
import * as os from 'os';
// Simple color logging utility
const colors = {
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    gray: (text) => `\x1b[90m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};
/**
 * Resource Optimizer
 */
export class ResourceOptimizer extends EventEmitter {
    monitoringInterval = null;
    gcObserver = null;
    thresholds;
    gcStats = new Map();
    benchmarks = [];
    lastCPUUsage = process.cpuUsage();
    lastCPUTime = Date.now();
    resourceHistory = [];
    constructor(thresholds = {}) {
        super();
        this.thresholds = {
            memoryWarning: 70,
            memoryCritical: 85,
            cpuWarning: 70,
            cpuCritical: 90,
            heapWarning: 400, // 400MB
            heapCritical: 500, // 500MB
            ...thresholds,
        };
        this.setupGCMonitoring();
        this.optimizeGarbageCollection();
        console.log(colors.blue('🚀 Resource Optimizer initialized'));
    }
    /**
     * Start resource monitoring
     */
    startMonitoring(intervalMs = 30000) {
        if (this.monitoringInterval) {
            return;
        }
        // eslint-disable-next-line functional/immutable-data
        this.monitoringInterval = setInterval(() => {
            this.collectResourceMetrics();
        }, intervalMs);
        console.log(colors.green(`📊 Resource monitoring started (${intervalMs}ms interval)`));
    }
    /**
     * Stop resource monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            // eslint-disable-next-line functional/immutable-data
            this.monitoringInterval = null;
        }
        if (this.gcObserver) {
            this.gcObserver.disconnect();
            // eslint-disable-next-line functional/immutable-data
            this.gcObserver = null;
        }
        console.log(colors.yellow('📊 Resource monitoring stopped'));
    }
    /**
     * Get current memory statistics
     */
    getMemoryStats() {
        const memUsage = process.memoryUsage();
        const heapStats = v8.getHeapStatistics();
        const gcStats = Array.from(this.gcStats.values()).reduce((acc, stats) => ({
            count: acc.count + stats.count,
            duration: acc.duration + stats.totalDuration,
        }), { count: 0, duration: 0 });
        return {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
            heapLimit: Math.round(heapStats.heap_size_limit / 1024 / 1024), // MB
            external: Math.round(memUsage.external / 1024 / 1024), // MB
            rss: Math.round(memUsage.rss / 1024 / 1024), // MB
            arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024), // MB
            heapUsagePercent: (memUsage.heapUsed / heapStats.heap_size_limit) * 100,
            gcCount: gcStats.count,
            gcDuration: gcStats.duration,
        };
    }
    /**
     * Get current CPU statistics
     */
    getCPUStats() {
        const currentUsage = process.cpuUsage(this.lastCPUUsage);
        const currentTime = Date.now();
        const timeDiff = currentTime - this.lastCPUTime;
        // Calculate CPU usage percentage
        const totalCPUTime = (currentUsage.user + currentUsage.system) / 1000; // Convert to ms
        const cpuUsagePercent = (totalCPUTime / timeDiff) * 100;
        // eslint-disable-next-line functional/immutable-data
        this.lastCPUUsage = process.cpuUsage();
        // eslint-disable-next-line functional/immutable-data
        this.lastCPUTime = currentTime;
        const loadAvg = os.loadavg();
        return {
            user: currentUsage.user,
            system: currentUsage.system,
            total: currentUsage.user + currentUsage.system,
            loadAverage: loadAvg,
            cpuUsagePercent: Math.min(cpuUsagePercent, 100), // Cap at 100%
        };
    }
    /**
     * Force garbage collection (if --expose-gc flag is used)
     */
    forceGarbageCollection() {
        if (global.gc) {
            const before = this.getMemoryStats();
            global.gc();
            const after = this.getMemoryStats();
            const memoryFreed = before.heapUsed - after.heapUsed;
            console.log(colors.green(`🗑️ Forced GC freed ${memoryFreed}MB`));
            this.emit('gcForced', { before, after, memoryFreed });
            return true;
        }
        console.warn(colors.yellow('⚠️ Garbage collection not exposed. Use --expose-gc flag.'));
        return false;
    }
    /**
     * Optimize garbage collection settings
     */
    optimizeGarbageCollection() {
        // Set V8 flags for better GC performance
        const gcFlags = [
            '--max-old-space-size=512', // 512MB heap limit
            '--optimize-for-size', // Optimize for memory usage
            '--gc-interval=100', // More frequent GC
        ];
        // Note: These flags need to be set at Node.js startup
        console.log(colors.blue('🔧 GC optimization flags recommended:'), gcFlags.join(' '));
    }
    /**
     * Setup garbage collection monitoring
     */
    setupGCMonitoring() {
        // eslint-disable-next-line functional/immutable-data
        this.gcObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            for (const entry of entries) {
                if (entry.entryType === 'gc') {
                    this.trackGCEvent(entry);
                }
            }
        });
        this.gcObserver.observe({ entryTypes: ['gc'] });
    }
    /**
     * Track garbage collection event
     */
    trackGCEvent(entry) {
        const gcType = entry.detail?.kind || 'unknown';
        const duration = entry.duration;
        if (!this.gcStats.has(gcType)) {
            // eslint-disable-next-line functional/immutable-data
            this.gcStats.set(gcType, {
                count: 0,
                totalDuration: 0,
                averageDuration: 0,
                lastGC: 0,
                type: gcType,
            });
        }
        const stats = this.gcStats.get(gcType);
        // eslint-disable-next-line functional/immutable-data
        stats.count++;
        // eslint-disable-next-line functional/immutable-data
        stats.totalDuration += duration;
        // eslint-disable-next-line functional/immutable-data
        stats.averageDuration = stats.totalDuration / stats.count;
        // eslint-disable-next-line functional/immutable-data
        stats.lastGC = Date.now();
        // Emit GC event
        this.emit('gc', {
            type: gcType,
            duration,
            stats: { ...stats },
        });
        // Log long GC pauses
        if (duration > 100) {
            // 100ms threshold
            console.warn(colors.yellow(`⏱️ Long GC pause: ${gcType} took ${duration.toFixed(2)}ms`));
        }
    }
    /**
     * Collect and analyze resource metrics
     */
    collectResourceMetrics() {
        const memory = this.getMemoryStats();
        const cpu = this.getCPUStats();
        // Store in history
        // eslint-disable-next-line functional/immutable-data
        this.resourceHistory.push({
            timestamp: Date.now(),
            memory,
            cpu,
        });
        // Keep only last 100 entries
        if (this.resourceHistory.length > 100) {
            // eslint-disable-next-line functional/immutable-data
            this.resourceHistory = this.resourceHistory.slice(-100);
        }
        // Check thresholds and emit alerts
        this.checkResourceThresholds(memory, cpu);
        // Emit metrics event
        this.emit('metrics', { memory, cpu });
    }
    /**
     * Check resource thresholds and emit alerts
     */
    checkResourceThresholds(memory, cpu) {
        // Memory threshold checks
        if (memory.heapUsagePercent > this.thresholds.memoryCritical) {
            this.emit('alert', {
                type: 'memory',
                level: 'critical',
                message: `Heap usage critical: ${memory.heapUsagePercent.toFixed(1)}%`,
                value: memory.heapUsagePercent,
                threshold: this.thresholds.memoryCritical,
            });
        }
        else if (memory.heapUsagePercent > this.thresholds.memoryWarning) {
            this.emit('alert', {
                type: 'memory',
                level: 'warning',
                message: `Heap usage high: ${memory.heapUsagePercent.toFixed(1)}%`,
                value: memory.heapUsagePercent,
                threshold: this.thresholds.memoryWarning,
            });
        }
        // Heap size checks
        if (memory.heapUsed > this.thresholds.heapCritical) {
            this.emit('alert', {
                type: 'heap',
                level: 'critical',
                message: `Heap size critical: ${memory.heapUsed}MB`,
                value: memory.heapUsed,
                threshold: this.thresholds.heapCritical,
            });
        }
        else if (memory.heapUsed > this.thresholds.heapWarning) {
            this.emit('alert', {
                type: 'heap',
                level: 'warning',
                message: `Heap size high: ${memory.heapUsed}MB`,
                value: memory.heapUsed,
                threshold: this.thresholds.heapWarning,
            });
        }
        // CPU threshold checks
        if (cpu.cpuUsagePercent > this.thresholds.cpuCritical) {
            this.emit('alert', {
                type: 'cpu',
                level: 'critical',
                message: `CPU usage critical: ${cpu.cpuUsagePercent.toFixed(1)}%`,
                value: cpu.cpuUsagePercent,
                threshold: this.thresholds.cpuCritical,
            });
        }
        else if (cpu.cpuUsagePercent > this.thresholds.cpuWarning) {
            this.emit('alert', {
                type: 'cpu',
                level: 'warning',
                message: `CPU usage high: ${cpu.cpuUsagePercent.toFixed(1)}%`,
                value: cpu.cpuUsagePercent,
                threshold: this.thresholds.cpuWarning,
            });
        }
    }
    /**
     * Run performance benchmark
     */
    async benchmark(name, fn) {
        const memoryBefore = this.getMemoryStats();
        const startTime = performance.now();
        try {
            await fn();
        }
        catch (error) {
            console.error(colors.red(`❌ Benchmark '${name}' failed:`), error);
            throw error;
        }
        const endTime = performance.now();
        const memoryAfter = this.getMemoryStats();
        const result = {
            name,
            duration: endTime - startTime,
            memoryBefore,
            memoryAfter,
            memoryDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
            timestamp: Date.now(),
        };
        // eslint-disable-next-line functional/immutable-data
        this.benchmarks.push(result);
        // Keep only last 50 benchmarks
        if (this.benchmarks.length > 50) {
            // eslint-disable-next-line functional/immutable-data
            this.benchmarks = this.benchmarks.slice(-50);
        }
        console.log(colors.cyan(`⏱️ Benchmark '${name}': ${result.duration.toFixed(2)}ms, Memory Δ: ${result.memoryDelta}MB`));
        this.emit('benchmark', result);
        return result;
    }
    /**
     * Get resource usage history
     */
    getResourceHistory() {
        return [...this.resourceHistory];
    }
    /**
     * Get garbage collection statistics
     */
    getGCStats() {
        return Object.fromEntries(this.gcStats);
    }
    /**
     * Get benchmark results
     */
    getBenchmarks() {
        return [...this.benchmarks];
    }
    /**
     * Get resource usage summary
     */
    getResourceSummary() {
        return {
            memory: this.getMemoryStats(),
            cpu: this.getCPUStats(),
            gc: this.getGCStats(),
            uptime: process.uptime(),
            nodeVersion: process.version,
            v8Version: process.versions.v8,
        };
    }
    /**
     * Optimize memory usage
     */
    optimizeMemory() {
        // Clear old resource history
        if (this.resourceHistory.length > 50) {
            // eslint-disable-next-line functional/immutable-data
            this.resourceHistory = this.resourceHistory.slice(-50);
        }
        // Clear old benchmarks
        if (this.benchmarks.length > 25) {
            // eslint-disable-next-line functional/immutable-data
            this.benchmarks = this.benchmarks.slice(-25);
        }
        // Force garbage collection if available
        this.forceGarbageCollection();
        console.log(colors.green('🧹 Memory optimization completed'));
    }
    /**
     * Set resource thresholds
     */
    setThresholds(thresholds) {
        // eslint-disable-next-line functional/immutable-data
        this.thresholds = { ...this.thresholds, ...thresholds };
        console.log(colors.blue('🎯 Resource thresholds updated'));
    }
    /**
     * Shutdown and cleanup
     */
    shutdown() {
        console.log(colors.blue('🛑 Shutting down Resource Optimizer...'));
        this.stopMonitoring();
        this.removeAllListeners();
    }
}
/**
 * Singleton Resource Optimizer instance
 */
// eslint-disable-next-line functional/no-let
let resourceOptimizerInstance = null;
/**
 * Get or create the global Resource Optimizer instance
 */
export function getResourceOptimizer(thresholds) {
    if (!resourceOptimizerInstance) {
        resourceOptimizerInstance = new ResourceOptimizer(thresholds);
    }
    return resourceOptimizerInstance;
}
/**
 * Reset the global Resource Optimizer instance (for testing)
 */
export function resetResourceOptimizer() {
    if (resourceOptimizerInstance) {
        resourceOptimizerInstance.shutdown();
    }
    resourceOptimizerInstance = null;
}
//# sourceMappingURL=ResourceOptimizer.js.map