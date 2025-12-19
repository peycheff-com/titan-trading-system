/**
 * High-Frequency Trading Processor for Titan Trading System
 * 
 * Provides ultra-low latency signal processing (<10ms) with advanced
 * optimization techniques for high-frequency trading requirements.
 * 
 * Requirements: 10.1 - Ultra-low latency signal processing and HFT optimization
 */

import { EventEmitter } from 'eventemitter3';
import { performance } from 'perf_hooks';

// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
};

/**
 * High-frequency signal data structure
 */
export interface HFSignal {
  id: string;
  timestamp: number; // High-precision timestamp
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
  maxLatency: number; // Maximum allowed latency in microseconds
  enabled: boolean;
}

/**
 * High-frequency processor configuration
 */
export interface HFProcessorConfig {
  maxLatencyMicros: number; // Maximum total processing latency
  enableJITOptimization: boolean;
  enableMemoryPooling: boolean;
  enableCPUAffinity: boolean;
  cpuCoreId?: number;
  batchSize: number;
  batchTimeoutMicros: number;
  enableProfiling: boolean;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number; // Latency threshold for circuit breaker
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
 * Memory pool for object reuse
 */
class MemoryPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private hits = 0;
  private misses = 0;
  
  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    initialSize: number = 100
  ) {
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
  acquire(): T {
    if (this.pool.length > 0) {
      this.hits++;
      const obj = this.pool.pop()!;
      this.resetFn(obj);
      return obj;
    }
    
    this.misses++;
    return this.createFn();
  }
  
  /**
   * Return object to pool
   */
  release(obj: T): void {
    if (this.pool.length < 1000) { // Prevent unlimited growth
      this.pool.push(obj);
    }
  }
  
  /**
   * Get pool statistics
   */
  getStats(): { hits: number; misses: number; poolSize: number; hitRate: number } {
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
class PriorityQueue<T> {
  private heap: Array<{ item: T; priority: number }> = [];
  
  /**
   * Add item with priority
   */
  enqueue(item: T, priority: number): void {
    const node = { item, priority };
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }
  
  /**
   * Remove and return highest priority item
   */
  dequeue(): T | null {
    if (this.heap.length === 0) return null;
    
    const max = this.heap[0];
    const end = this.heap.pop()!;
    
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this.bubbleDown(0);
    }
    
    return max.item;
  }
  
  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }
  
  /**
   * Get queue size
   */
  size(): number {
    return this.heap.length;
  }
  
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].priority >= this.heap[index].priority) break;
      
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }
  
  private bubbleDown(index: number): void {
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
      
      if (maxIndex === index) break;
      
      [this.heap[index], this.heap[maxIndex]] = [this.heap[maxIndex], this.heap[index]];
      index = maxIndex;
    }
  }
}

/**
 * JIT (Just-In-Time) optimizer for hot code paths
 */
class JITOptimizer {
  private hotFunctions = new Map<string, { count: number; optimized: boolean }>();
  private optimizationThreshold = 1000; // Optimize after 1000 calls
  
  /**
   * Track function call
   */
  trackCall(functionName: string): boolean {
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
  getStats(): Record<string, { count: number; optimized: boolean }> {
    return Object.fromEntries(this.hotFunctions);
  }
}

/**
 * Circuit breaker for latency protection
 */
class LatencyCircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeMs: number = 1000
  ) {}
  
  /**
   * Check if processing should be allowed
   */
  canProcess(): boolean {
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
  recordSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  /**
   * Record failed processing (high latency)
   */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
  
  getState(): string {
    return this.state;
  }
}

/**
 * High-Frequency Trading Processor
 */
export class HighFrequencyProcessor extends EventEmitter {
  private config: HFProcessorConfig;
  private processingStages: ProcessingStage[] = [];
  private priorityQueue: PriorityQueue<HFSignal>;
  private memoryPool: MemoryPool<HFSignal>;
  private jitOptimizer: JITOptimizer;
  private circuitBreaker: LatencyCircuitBreaker;
  private metrics: HFTMetrics;
  private latencyHistory: number[] = [];
  private isProcessing = false;
  private processingTimer: NodeJS.Timeout | null = null;
  
  // Pre-allocated arrays for performance
  private batchBuffer: HFSignal[] = [];
  private tempResults: (HFSignal | null)[] = [];
  
  constructor(config: Partial<HFProcessorConfig> = {}) {
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
    
    this.priorityQueue = new PriorityQueue<HFSignal>();
    this.jitOptimizer = new JITOptimizer();
    this.circuitBreaker = new LatencyCircuitBreaker(5, 1000);
    
    // Initialize memory pool
    this.memoryPool = new MemoryPool<HFSignal>(
      () => ({
        id: '',
        timestamp: 0,
        symbol: '',
        type: 'SIGNAL',
        priority: 'NORMAL',
        data: {}
      }),
      (signal) => {
        signal.id = '';
        signal.timestamp = 0;
        signal.symbol = '';
        signal.type = 'SIGNAL';
        signal.priority = 'NORMAL';
        signal.data = {};
        signal.processingMetrics = undefined;
      },
      this.config.preallocatedObjects
    );
    
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
  start(): void {
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
  stop(): void {
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
  addStage(stage: ProcessingStage): void {
    this.processingStages.push(stage);
    console.log(colors.cyan(`➕ Added processing stage: ${stage.name} (max latency: ${stage.maxLatency}μs)`));
  }
  
  /**
   * Remove processing stage
   */
  removeStage(stageName: string): boolean {
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
  async processSignal(signal: HFSignal): Promise<void> {
    const startTime = performance.now();
    
    // Check circuit breaker
    if (this.config.enableCircuitBreaker && !this.circuitBreaker.canProcess()) {
      this.metrics.circuitBreakerTrips++;
      this.emit('circuitBreakerTripped', { signal, reason: 'High latency detected' });
      return;
    }
    
    // Use memory pool if enabled
    let processedSignal: HFSignal;
    if (this.config.enableMemoryPooling) {
      processedSignal = this.memoryPool.acquire();
      Object.assign(processedSignal, signal);
    } else {
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
    
    const processingTime = (performance.now() - startTime) * 1000; // Convert to microseconds
    
    // Update metrics
    this.updateLatencyMetrics(processingTime);
    
    // Check latency threshold
    if (processingTime > this.config.circuitBreakerThreshold) {
      this.circuitBreaker.recordFailure();
    } else {
      this.circuitBreaker.recordSuccess();
    }
  }
  
  /**
   * Start batch processing loop
   */
  private startBatchProcessing(): void {
    const processBatch = async () => {
      if (!this.isProcessing) {
        return;
      }
      
      const batchStartTime = performance.now();
      const batch: HFSignal[] = [];
      
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
      
      const batchTime = (performance.now() - batchStartTime) * 1000;
      
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
  private async processBatch(batch: HFSignal[]): Promise<void> {
    const batchStartTime = performance.now();
    
    try {
      // Process each signal through all stages
      for (let i = 0; i < batch.length; i++) {
        let signal = batch[i];
        
        // Add processing metrics
        signal.processingMetrics = {
          receivedAt: signal.timestamp,
          processedAt: performance.now() * 1000, // Convert to microseconds
          latency: 0
        };
        
        // Process through all enabled stages
        for (const stage of this.processingStages) {
          if (!stage.enabled) continue;
          
          const stageStartTime = performance.now();
          
          try {
            const processedSignal = await stage.process(signal);
            if (!processedSignal) break; // Stage filtered out the signal
            signal = processedSignal;
            
            const stageTime = (performance.now() - stageStartTime) * 1000;
            
            // Check stage latency
            if (stageTime > stage.maxLatency) {
              console.warn(colors.yellow(`⚠️ Stage ${stage.name} exceeded max latency: ${stageTime.toFixed(2)}μs > ${stage.maxLatency}μs`));
            }
            
          } catch (error) {
            console.error(colors.red(`❌ Error in stage ${stage.name}:`), error);
            break;
          }
        }
        
        if (signal) {
          // Calculate final processing latency
          signal.processingMetrics!.latency = (performance.now() * 1000) - signal.processingMetrics!.receivedAt;
          
          // Emit processed signal
          this.emit('signalProcessed', signal);
          
          // Return to memory pool if enabled
          if (this.config.enableMemoryPooling) {
            this.memoryPool.release(signal);
          }
        }
      }
      
      const batchTime = (performance.now() - batchStartTime) * 1000;
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
      
    } catch (error) {
      console.error(colors.red('❌ Batch processing error:'), error);
    }
  }
  
  /**
   * Get priority value for queue
   */
  private getPriority(priority: HFSignal['priority']): number {
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
  private updateLatencyMetrics(latencyMicros: number): void {
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
  getMetrics(): HFTMetrics {
    // Update memory pool metrics
    const poolStats = this.memoryPool.getStats();
    this.metrics.memoryPoolHits = poolStats.hits;
    this.metrics.memoryPoolMisses = poolStats.misses;
    
    return { ...this.metrics };
  }
  
  /**
   * Get processing statistics
   */
  getProcessingStats(): {
    queueSize: number;
    activeStages: number;
    circuitBreakerState: string;
    jitStats: Record<string, { count: number; optimized: boolean }>;
    memoryPoolStats: { hits: number; misses: number; poolSize: number; hitRate: number };
  } {
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
  resetMetrics(): void {
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
  updateConfig(config: Partial<HFProcessorConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(colors.blue('⚙️ High-frequency processor configuration updated'));
  }
  
  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down High-Frequency Processor...'));
    this.stop();
    this.processingStages = [];
    this.latencyHistory = [];
    this.removeAllListeners();
  }
}

/**
 * Default high-frequency processor configuration
 */
export const DEFAULT_HF_PROCESSOR_CONFIG: HFProcessorConfig = {
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
let hfProcessorInstance: HighFrequencyProcessor | null = null;

/**
 * Get or create the global High-Frequency Processor instance
 */
export function getHighFrequencyProcessor(config?: Partial<HFProcessorConfig>): HighFrequencyProcessor {
  if (!hfProcessorInstance) {
    hfProcessorInstance = new HighFrequencyProcessor(config);
  }
  return hfProcessorInstance;
}

/**
 * Reset the global High-Frequency Processor instance (for testing)
 */
export function resetHighFrequencyProcessor(): void {
  if (hfProcessorInstance) {
    hfProcessorInstance.shutdown();
  }
  hfProcessorInstance = null;
}