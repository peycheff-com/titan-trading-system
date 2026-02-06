/**
 * Performance Monitor for Titan Trading System
 *
 * Integrates with all shared services to provide comprehensive
 * performance monitoring, alerting, and automatic scaling recommendations.
 *
 * Requirements: 5.4 - Performance monitoring and alerting systems
 */
import { EventEmitter } from 'eventemitter3';
import { type CPUStats, type MemoryStats } from './ResourceOptimizer';
/**
 * Performance metrics aggregation
 */
export interface PerformanceMetrics {
    timestamp: number;
    memory: MemoryStats;
    cpu: CPUStats;
    websocket: {
        totalConnections: number;
        activeConnections: number;
        messagesPerSecond: number;
        averageLatency: number;
        compressionRatio: number;
    };
    execution: {
        totalOrders: number;
        successRate: number;
        averageLatency: number;
        activeExchanges: number;
    };
    telemetry: {
        logsPerSecond: number;
        errorRate: number;
        metricsCount: number;
    };
}
/**
 * Performance alert
 */
export interface PerformanceAlert {
    id: string;
    timestamp: number;
    service: string;
    metric: string;
    level: 'warning' | 'critical';
    value: number;
    threshold: number;
    message: string;
    recommendations?: string[];
}
/**
 * Scaling recommendation
 */
export interface ScalingRecommendation {
    timestamp: number;
    service: string;
    action: 'scale_up' | 'scale_down' | 'optimize' | 'restart';
    reason: string;
    priority: 'low' | 'medium' | 'high';
    estimatedImpact: string;
}
/**
 * Performance Monitor Configuration
 */
export interface PerformanceMonitorConfig {
    monitoringInterval: number;
    alertingEnabled: boolean;
    autoScalingEnabled: boolean;
    metricsRetentionDays: number;
    alertThresholds: {
        memoryWarning: number;
        memoryCritical: number;
        cpuWarning: number;
        cpuCritical: number;
        latencyWarning: number;
        latencyCritical: number;
        errorRateWarning: number;
        errorRateCritical: number;
    };
}
/**
 * Performance Monitor
 */
export declare class PerformanceMonitor extends EventEmitter {
    private config;
    private monitoringTimer;
    private metricsHistory;
    private activeAlerts;
    private recommendations;
    private isMonitoring;
    constructor(config?: Partial<PerformanceMonitorConfig>);
    /**
     * Start performance monitoring
     */
    startMonitoring(): void;
    /**
     * Stop performance monitoring
     */
    stopMonitoring(): void;
    /**
     * Setup event listeners for all services
     */
    private setupEventListeners;
    /**
     * Collect comprehensive performance metrics
     */
    private collectMetrics;
    /**
     * Handle resource alerts from ResourceOptimizer
     */
    private handleResourceAlert;
    /**
     * Create and manage performance alert
     */
    private createAlert;
    /**
     * Track error rate for alerting
     */
    private trackErrorRate;
    /**
     * Analyze metrics and detect performance issues
     */
    private analyzeMetrics;
    /**
     * Generate scaling recommendations
     */
    private generateScalingRecommendations;
    /**
     * Clean up old metrics data
     */
    private cleanupOldMetrics;
    /**
     * Get current performance metrics
     */
    getCurrentMetrics(): PerformanceMetrics | null;
    /**
     * Get metrics history
     */
    getMetricsHistory(hours?: number): PerformanceMetrics[];
    /**
     * Get active alerts
     */
    getActiveAlerts(): PerformanceAlert[];
    /**
     * Get scaling recommendations
     */
    getRecommendations(): ScalingRecommendation[];
    /**
     * Clear alert
     */
    clearAlert(alertId: string): boolean;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<PerformanceMonitorConfig>): void;
    /**
     * Get performance summary
     */
    getPerformanceSummary(): {
        isHealthy: boolean;
        activeAlerts: number;
        recommendations: number;
        uptime: number;
        lastMetricsUpdate: number;
    };
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
/**
 * Get or create the global Performance Monitor instance
 */
export declare function getPerformanceMonitor(config?: Partial<PerformanceMonitorConfig>): PerformanceMonitor;
/**
 * Reset the global Performance Monitor instance (for testing)
 */
export declare function resetPerformanceMonitor(): void;
//# sourceMappingURL=PerformanceMonitor.d.ts.map