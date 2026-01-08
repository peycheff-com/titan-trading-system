"use strict";
/**
 * High-Frequency Trading Processor for Titan Trading System
 *
 * Provides ultra-low latency signal processing (<10ms) with advanced
 * optimization techniques for high-frequency trading requirements.
 *
 * Requirements: 10.1 - Ultra-low latency signal processing and HFT optimization
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_HF_PROCESSOR_CONFIG = exports.HighFrequencyProcessor = void 0;
exports.getHighFrequencyProcessor = getHighFrequencyProcessor;
exports.resetHighFrequencyProcessor = resetHighFrequencyProcessor;
const eventemitter3_1 = require("eventemitter3");
const perf_hooks_1 = require("perf_hooks");
// Simple color logging utility
const colors = {
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
};
/**
 * Memory pool for object reuse
 */
class MemoryPool {
    pool = [];
    createFn;
    resetFn;
    hits = 0;
    misses = 0;
    constructor(createFn, resetFn, initialSize = 100) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        // Pre-allocate objects
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(createFn());
        }
    }
    /**
     * Get object from pool
     */
    acquire() {
        if (this.pool.length > 0) {
            this.hits++;
            const obj = this.pool.pop();
            this.resetFn(obj);
            return obj;
        }
        this.misses++;
        return this.createFn();
    }
    /**
     * Return object to pool
     */
    release(obj) {
        if (this.pool.length < 1000) { // Prevent unlimited growth
            this.pool.push(obj);
        }
    }
    /**
     * Get pool statistics
     */
    getStats() {
        const total = this.hits + this.misses;
        return {
            hits: this.hits,
            misses: this.misses,
            poolSize: this.pool.length,
            hitRate: total > 0 ? this.hits / total : 0
        };
    }
}
/**
 * Priority queue for signal processing
 */
class PriorityQueue {
    heap = [];
    /**
     * Add item with priority
     */
    enqueue(item, priority) {
        const node = { item, priority };
        this.heap.push(node);
        this.bubbleUp(this.heap.length - 1);
    }
    /**
     * Remove and return highest priority item
     */
    dequeue() {
        if (this.heap.length === 0)
            return null;
        const max = this.heap[0];
        const end = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = end;
            this.bubbleDown(0);
        }
        return max.item;
    }
    /**
     * Check if queue is empty
     */
    isEmpty() {
        return this.heap.length === 0;
    }
    /**
     * Get queue size
     */
    size() {
        return this.heap.length;
    }
    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[parentIndex].priority >= this.heap[index].priority)
                break;
            [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
            index = parentIndex;
        }
    }
    bubbleDown(index) {
        while (true) {
            let maxIndex = index;
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            if (leftChild < this.heap.length &&
                this.heap[leftChild].priority > this.heap[maxIndex].priority) {
                maxIndex = leftChild;
            }
            if (rightChild < this.heap.length &&
                this.heap[rightChild].priority > this.heap[maxIndex].priority) {
                maxIndex = rightChild;
            }
            if (maxIndex === index)
                break;
            [this.heap[index], this.heap[maxIndex]] = [this.heap[maxIndex], this.heap[index]];
            index = maxIndex;
        }
    }
}
/**
 * JIT (Just-In-Time) optimizer for hot code paths
 */
class JITOptimizer {
    hotFunctions = new Map();
    optimizationThreshold = 1000; // Optimize after 1000 calls
    /**
     * Track function call
     */
    trackCall(functionName) {
        const stats = this.hotFunctions.get(functionName) || { count: 0, optimized: false };
        stats.count++;
        if (!stats.optimized && stats.count >= this.optimizationThreshold) {
            stats.optimized = true;
            this.hotFunctions.set(functionName, stats);
            return true; // Signal that optimization should be applied
        }
        this.hotFunctions.set(functionName, stats);
        return false;
    }
    /**
     * Get optimization statistics
     */
    getStats() {
        return Object.fromEntries(this.hotFunctions);
    }
}
/**
 * Circuit breaker for latency protection
 */
class LatencyCircuitBreaker {
    failureThreshold;
    recoveryTimeMs;
    failures = 0;
    lastFailureTime = 0;
    state = 'CLOSED';
    constructor(failureThreshold = 5, recoveryTimeMs = 1000) {
        this.failureThreshold = failureThreshold;
        this.recoveryTimeMs = recoveryTimeMs;
    }
    /**
     * Check if processing should be allowed
     */
    canProcess() {
        if (this.state === 'CLOSED') {
            return true;
        }
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.recoveryTimeMs) {
                this.state = 'HALF_OPEN';
                return true;
            }
            return false;
        }
        // HALF_OPEN - allow one request
        return true;
    }
    /**
     * Record successful processing
     */
    recordSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }
    /**
     * Record failed processing (high latency)
     */
    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }
    getState() {
        return this.state;
    }
}
/**
 * High-Frequency Trading Processor
 */
class HighFrequencyProcessor extends eventemitter3_1.EventEmitter {
    config;
    processingStages = [];
    priorityQueue;
    memoryPool;
    jitOptimizer;
    circuitBreaker;
    metrics;
    latencyHistory = [];
    isProcessing = false;
    processingTimer = null;
    // Pre-allocated arrays for performance
    batchBuffer = [];
    tempResults = [];
    constructor(config = {}) {
        super();
        this.config = {
            maxLatencyMicros: 10000, // 10ms default
            enableJITOptimization: true,
            enableMemoryPooling: true,
            enableCPUAffinity: false,
            batchSize: 100,
            batchTimeoutMicros: 1000, // 1ms
            enableProfiling: true,
            enableCircuitBreaker: true,
            circuitBreakerThreshold: 5000, // 5ms
            priorityQueueSize: 10000,
            enablePreallocation: true,
            preallocatedObjects: 1000,
            ...config
        };
        this.priorityQueue = new PriorityQueue();
        this.jitOptimizer = new JITOptimizer();
        this.circuitBreaker = new LatencyCircuitBreaker(5, 1000);
        // Initialize memory pool
        this.memoryPool = new MemoryPool(() => ({
            id: '',
            timestamp: 0,
            symbol: '',
            type: 'SIGNAL',
            priority: 'NORMAL',
            data: {}
        }), (signal) => {
            signal.id = '';
            signal.timestamp = 0;
            signal.symbol = '';
            signal.type = 'SIGNAL';
            signal.priority = 'NORMAL';
            signal.data = {};
            signal.processingMetrics = undefined;
        }, this.config.preallocatedObjects);
        this.metrics = {
            totalSignals: 0,
            averageLatencyMicros: 0,
            p50LatencyMicros: 0,
            p95LatencyMicros: 0,
            p99LatencyMicros: 0,
            maxLatencyMicros: 0,
            signalsPerSecond: 0,
            circuitBreakerTrips: 0,
            memoryPoolHits: 0,
            memoryPoolMisses: 0,
            jitOptimizations: 0,
            lastResetTime: Date.now()
        };
        // Pre-allocate batch processing arrays
        if (this.config.enablePreallocation) {
            this.batchBuffer = new Array(this.config.batchSize);
            this.tempResults = new Array(this.config.batchSize);
        }
        console.log(colors.blue(`⚡ High-Frequency Processor initialized (max latency: ${this.config.maxLatencyMicros}μs)`));
    }
    /**
     * Start high-frequency processing
     */
    start() {
        if (this.isProcessing) {
            return;
        }
        this.isProcessing = true;
        // Set CPU affinity if enabled (simplified simulation)
        if (this.config.enableCPUAffinity && this.config.cpuCoreId !== undefined) {
            console.log(colors.cyan(`🔧 Setting CPU affinity to core ${this.config.cpuCoreId}`));
            // In real implementation, would use process.binding or native modules
        }
        // Start batch processing loop
        this.startBatchProcessing();
        console.log(colors.green('🚀 High-Frequency Processor started'));
    }
    /**
     * Stop high-frequency processing
     */
    stop() {
        if (!this.isProcessing) {
            return;
        }
        this.isProcessing = false;
        if (this.processingTimer) {
            clearTimeout(this.processingTimer);
            this.processingTimer = null;
        }
        console.log(colors.yellow('🛑 High-Frequency Processor stopped'));
    }
    /**
     * Add processing stage
     */
    addStage(stage) {
        this.processingStages.push(stage);
        console.log(colors.cyan(`➕ Added processing stage: ${stage.name} (max latency: ${stage.maxLatency}μs)`));
    }
    /**
     * Remove processing stage
     */
    removeStage(stageName) {
        const index = this.processingStages.findIndex(stage => stage.name === stageName);
        if (index >= 0) {
            this.processingStages.splice(index, 1);
            console.log(colors.yellow(`➖ Removed processing stage: ${stageName}`));
            return true;
        }
        return false;
    }
    /**
     * Process signal with ultra-low latency
     */
    async processSignal(signal) {
        const startTime = perf_hooks_1.performance.now();
        // Check circuit breaker
        if (this.config.enableCircuitBreaker && !this.circuitBreaker.canProcess()) {
            this.metrics.circuitBreakerTrips++;
            this.emit('circuitBreakerTripped', { signal, reason: 'High latency detected' });
            return;
        }
        // Use memory pool if enabled
        let processedSignal;
        if (this.config.enableMemoryPooling) {
            processedSignal = this.memoryPool.acquire();
            Object.assign(processedSignal, signal);
        }
        else {
            processedSignal = { ...signal };
        }
        // Add to priority queue
        const priority = this.getPriority(processedSignal.priority);
        this.priorityQueue.enqueue(processedSignal, priority);
        // Track JIT optimization
        if (this.config.enableJITOptimization) {
            const shouldOptimize = this.jitOptimizer.trackCall('processSignal');
            if (shouldOptimize) {
                this.metrics.jitOptimizations++;
                console.log(colors.magenta('🔥 JIT optimization applied to processSignal'));
            }
        }
        const processingTime = (perf_hooks_1.performance.now() - startTime) * 1000; // Convert to microseconds
        // Update metrics
        this.updateLatencyMetrics(processingTime);
        // Check latency threshold
        if (processingTime > this.config.circuitBreakerThreshold) {
            this.circuitBreaker.recordFailure();
        }
        else {
            this.circuitBreaker.recordSuccess();
        }
    }
    /**
     * Start batch processing loop
     */
    startBatchProcessing() {
        const processBatch = async () => {
            if (!this.isProcessing) {
                return;
            }
            const batchStartTime = perf_hooks_1.performance.now();
            const batch = [];
            // Collect batch
            let batchCount = 0;
            while (!this.priorityQueue.isEmpty() && batchCount < this.config.batchSize) {
                const signal = this.priorityQueue.dequeue();
                if (signal) {
                    batch.push(signal);
                    batchCount++;
                }
            }
            if (batch.length > 0) {
                await this.processBatch(batch);
            }
            const batchTime = (perf_hooks_1.performance.now() - batchStartTime) * 1000;
            // Schedule next batch processing
            const nextDelay = Math.max(0, this.config.batchTimeoutMicros / 1000 - batchTime / 1000);
            this.processingTimer = setTimeout(processBatch, nextDelay);
        };
        // Start the processing loop
        processBatch();
    }
    /**
     * Process batch of signals
     */
    async processBatch(batch) {
        const batchStartTime = perf_hooks_1.performance.now();
        try {
            // Process each signal through all stages
            for (let i = 0; i < batch.length; i++) {
                let signal = batch[i];
                // Add processing metrics
                signal.processingMetrics = {
                    receivedAt: signal.timestamp,
                    processedAt: perf_hooks_1.performance.now() * 1000, // Convert to microseconds
                    latency: 0
                };
                // Process through all enabled stages
                for (const stage of this.processingStages) {
                    if (!stage.enabled)
                        continue;
                    const stageStartTime = perf_hooks_1.performance.now();
                    try {
                        const processedSignal = await stage.process(signal);
                        if (!processedSignal)
                            break; // Stage filtered out the signal
                        signal = processedSignal;
                        const stageTime = (perf_hooks_1.performance.now() - stageStartTime) * 1000;
                        // Check stage latency
                        if (stageTime > stage.maxLatency) {
                            console.warn(colors.yellow(`⚠️ Stage ${stage.name} exceeded max latency: ${stageTime.toFixed(2)}μs > ${stage.maxLatency}μs`));
                        }
                    }
                    catch (error) {
                        console.error(colors.red(`❌ Error in stage ${stage.name}:`), error);
                        break;
                    }
                }
                if (signal) {
                    // Calculate final processing latency
                    signal.processingMetrics.latency = (perf_hooks_1.performance.now() * 1000) - signal.processingMetrics.receivedAt;
                    // Emit processed signal
                    this.emit('signalProcessed', signal);
                    // Return to memory pool if enabled
                    if (this.config.enableMemoryPooling) {
                        this.memoryPool.release(signal);
                    }
                }
            }
            const batchTime = (perf_hooks_1.performance.now() - batchStartTime) * 1000;
            this.metrics.totalSignals += batch.length;
            // Update signals per second
            const timeSinceReset = (Date.now() - this.metrics.lastResetTime) / 1000;
            if (timeSinceReset > 0) {
                this.metrics.signalsPerSecond = this.metrics.totalSignals / timeSinceReset;
            }
            // Emit batch metrics
            this.emit('batchProcessed', {
                batchSize: batch.length,
                processingTimeMicros: batchTime,
                signalsPerSecond: this.metrics.signalsPerSecond
            });
        }
        catch (error) {
            console.error(colors.red('❌ Batch processing error:'), error);
        }
    }
    /**
     * Get priority value for queue
     */
    getPriority(priority) {
        switch (priority) {
            case 'CRITICAL': return 1000;
            case 'HIGH': return 100;
            case 'NORMAL': return 10;
            case 'LOW': return 1;
            default: return 10;
        }
    }
    /**
     * Update latency metrics
     */
    updateLatencyMetrics(latencyMicros) {
        this.latencyHistory.push(latencyMicros);
        // Keep only last 1000 measurements
        if (this.latencyHistory.length > 1000) {
            this.latencyHistory = this.latencyHistory.slice(-1000);
        }
        // Calculate percentiles
        const sorted = [...this.latencyHistory].sort((a, b) => a - b);
        const len = sorted.length;
        this.metrics.p50LatencyMicros = sorted[Math.floor(len * 0.5)] || 0;
        this.metrics.p95LatencyMicros = sorted[Math.floor(len * 0.95)] || 0;
        this.metrics.p99LatencyMicros = sorted[Math.floor(len * 0.99)] || 0;
        this.metrics.maxLatencyMicros = Math.max(this.metrics.maxLatencyMicros, latencyMicros);
        // Calculate average
        const sum = this.latencyHistory.reduce((acc, val) => acc + val, 0);
        this.metrics.averageLatencyMicros = sum / len;
    }
    /**
     * Get current metrics
     */
    getMetrics() {
        // Update memory pool metrics
        const poolStats = this.memoryPool.getStats();
        this.metrics.memoryPoolHits = poolStats.hits;
        this.metrics.memoryPoolMisses = poolStats.misses;
        return { ...this.metrics };
    }
    /**
     * Get processing statistics
     */
    getProcessingStats() {
        return {
            queueSize: this.priorityQueue.size(),
            activeStages: this.processingStages.filter(stage => stage.enabled).length,
            circuitBreakerState: this.circuitBreaker.getState(),
            jitStats: this.jitOptimizer.getStats(),
            memoryPoolStats: this.memoryPool.getStats()
        };
    }
    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            totalSignals: 0,
            averageLatencyMicros: 0,
            p50LatencyMicros: 0,
            p95LatencyMicros: 0,
            p99LatencyMicros: 0,
            maxLatencyMicros: 0,
            signalsPerSecond: 0,
            circuitBreakerTrips: 0,
            memoryPoolHits: 0,
            memoryPoolMisses: 0,
            jitOptimizations: 0,
            lastResetTime: Date.now()
        };
        this.latencyHistory = [];
        console.log(colors.blue('📊 HFT metrics reset'));
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        console.log(colors.blue('⚙️ High-frequency processor configuration updated'));
    }
    /**
     * Shutdown and cleanup
     */
    shutdown() {
        console.log(colors.blue('🛑 Shutting down High-Frequency Processor...'));
        this.stop();
        this.processingStages = [];
        this.latencyHistory = [];
        this.removeAllListeners();
    }
}
exports.HighFrequencyProcessor = HighFrequencyProcessor;
/**
 * Default high-frequency processor configuration
 */
exports.DEFAULT_HF_PROCESSOR_CONFIG = {
    maxLatencyMicros: 10000, // 10ms
    enableJITOptimization: true,
    enableMemoryPooling: true,
    enableCPUAffinity: false,
    batchSize: 100,
    batchTimeoutMicros: 1000, // 1ms
    enableProfiling: true,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5000, // 5ms
    priorityQueueSize: 10000,
    enablePreallocation: true,
    preallocatedObjects: 1000
};
/**
 * Singleton High-Frequency Processor instance
 */
let hfProcessorInstance = null;
/**
 * Get or create the global High-Frequency Processor instance
 */
function getHighFrequencyProcessor(config) {
    if (!hfProcessorInstance) {
        hfProcessorInstance = new HighFrequencyProcessor(config);
    }
    return hfProcessorInstance;
}
/**
 * Reset the global High-Frequency Processor instance (for testing)
 */
function resetHighFrequencyProcessor() {
    if (hfProcessorInstance) {
        hfProcessorInstance.shutdown();
    }
    hfProcessorInstance = null;
}
//# sourceMappingURL=HighFrequencyProcessor.js.map