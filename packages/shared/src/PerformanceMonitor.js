/**
 * Performance Monitor for Titan Trading System
 *
 * Integrates with all shared services to provide comprehensive
 * performance monitoring, alerting, and automatic scaling recommendations.
 *
 * Requirements: 5.4 - Performance monitoring and alerting systems
 */
import { EventEmitter } from 'eventemitter3';
import { getWebSocketManager } from './WebSocketManager';
// Execution Service removal
// import { getExecutionService } from "./ExecutionService";
import { getTelemetryService } from './TelemetryService';
import { getResourceOptimizer } from './ResourceOptimizer';
// Simple color logging utility
const colors = {
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    gray: (text) => `\x1b[90m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
};
/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    monitoringInterval: 30000, // 30 seconds
    alertingEnabled: true,
    autoScalingEnabled: false,
    metricsRetentionDays: 7,
    alertThresholds: {
        memoryWarning: 70,
        memoryCritical: 85,
        cpuWarning: 70,
        cpuCritical: 90,
        latencyWarning: 1000, // 1 second
        latencyCritical: 5000, // 5 seconds
        errorRateWarning: 5, // 5%
        errorRateCritical: 10, // 10%
    },
};
/**
 * Performance Monitor
 */
export class PerformanceMonitor extends EventEmitter {
    config;
    monitoringTimer = null;
    metricsHistory = [];
    activeAlerts = new Map();
    recommendations = [];
    isMonitoring = false;
    constructor(config = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        console.log(colors.blue('🚀 Performance Monitor initialized'));
    }
    /**
     * Start performance monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) {
            return;
        }
        // eslint-disable-next-line functional/immutable-data
        this.isMonitoring = true;
        // Start resource optimizer monitoring
        const resourceOptimizer = getResourceOptimizer();
        resourceOptimizer.startMonitoring(this.config.monitoringInterval);
        // Set up event listeners
        this.setupEventListeners();
        // Start periodic metrics collection
        // eslint-disable-next-line functional/immutable-data
        this.monitoringTimer = setInterval(() => {
            this.collectMetrics();
        }, this.config.monitoringInterval);
        console.log(colors.green(`📊 Performance monitoring started (${this.config.monitoringInterval}ms interval)`));
    }
    /**
     * Stop performance monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }
        // eslint-disable-next-line functional/immutable-data
        this.isMonitoring = false;
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            // eslint-disable-next-line functional/immutable-data
            this.monitoringTimer = null;
        }
        // Stop resource optimizer monitoring
        const resourceOptimizer = getResourceOptimizer();
        resourceOptimizer.stopMonitoring();
        // Remove event listeners
        this.removeAllListeners();
        console.log(colors.yellow('📊 Performance monitoring stopped'));
    }
    /**
     * Setup event listeners for all services
     */
    setupEventListeners() {
        const resourceOptimizer = getResourceOptimizer();
        // Listen for resource alerts
        resourceOptimizer.on('alert', (alert) => {
            this.handleResourceAlert(alert);
        });
        // Listen for GC events
        resourceOptimizer.on('gc', (gcEvent) => {
            if (gcEvent.duration > 100) {
                // Long GC pause
                this.createAlert('memory', 'gc_pause', 'warning', gcEvent.duration, 100, `Long garbage collection pause: ${gcEvent.duration.toFixed(2)}ms`);
            }
        });
        // Listen for WebSocket events
        const wsManager = getWebSocketManager();
        wsManager.on('connectionError', (error) => {
            this.createAlert('websocket', 'connection_error', 'warning', 1, 0, `WebSocket connection error: ${error.exchange}`);
        });
        // Execution Service listeners removed (Service deprecated)
        // Listen for telemetry events
        const telemetry = getTelemetryService();
        telemetry.on('log', (entry) => {
            if (entry.level === 'ERROR' || entry.level === 'FATAL') {
                this.trackErrorRate(entry);
            }
        });
    }
    /**
     * Collect comprehensive performance metrics
     */
    async collectMetrics() {
        try {
            const resourceOptimizer = getResourceOptimizer();
            const wsManager = getWebSocketManager();
            const telemetry = getTelemetryService();
            // Get resource metrics
            const memory = resourceOptimizer.getMemoryStats();
            const cpu = resourceOptimizer.getCPUStats();
            // Get WebSocket metrics
            const wsStats = wsManager.getGlobalStats();
            const wsPerformance = wsManager.getAllPerformanceMetrics();
            const avgLatency = Object.values(wsPerformance).reduce((sum, metrics) => sum + (metrics.averageLatency || 0), 0) / Object.keys(wsPerformance).length || 0;
            const avgCompression = Object.values(wsPerformance).reduce((sum, metrics) => sum + (metrics.compressionRatio || 0), 0) / Object.keys(wsPerformance).length || 0;
            // Get execution metrics (Stubbed - Service Removed)
            const trackedOrders = [];
            const successfulOrders = 0;
            const successRate = 100;
            // Get telemetry metrics
            const telemetryStats = telemetry.getStats();
            const metrics = {
                timestamp: Date.now(),
                memory,
                cpu,
                websocket: {
                    totalConnections: wsStats.totalConnections,
                    activeConnections: wsStats.activeConnections,
                    messagesPerSecond: Object.values(wsPerformance).reduce((sum, metrics) => sum + (metrics.messagesPerSecond || 0), 0),
                    averageLatency: avgLatency,
                    compressionRatio: avgCompression,
                },
                execution: {
                    totalOrders: 0,
                    successRate: 100,
                    averageLatency: 0,
                    activeExchanges: 0,
                },
                telemetry: {
                    logsPerSecond: 0, // Would need to track this separately
                    errorRate: 0, // Would need to track this separately
                    metricsCount: telemetryStats.metricsCount || 0,
                },
            };
            // Store metrics
            // eslint-disable-next-line functional/immutable-data
            this.metricsHistory.push(metrics);
            // Clean up old metrics
            this.cleanupOldMetrics();
            // Analyze metrics and generate recommendations
            this.analyzeMetrics(metrics);
            // Emit metrics event
            this.emit('metrics', metrics);
        }
        catch (error) {
            console.error(colors.red('❌ Failed to collect performance metrics:'), error);
        }
    }
    /**
     * Handle resource alerts from ResourceOptimizer
     */
    handleResourceAlert(alert) {
        this.createAlert('resource', alert.type, alert.level, alert.value, alert.threshold, alert.message);
    }
    /**
     * Create and manage performance alert
     */
    createAlert(service, metric, level, value, threshold, message, recommendations) {
        if (!this.config.alertingEnabled) {
            return;
        }
        const alertId = `${service}_${metric}_${level}`;
        const alert = {
            id: alertId,
            timestamp: Date.now(),
            service,
            metric,
            level,
            value,
            threshold,
            message,
            recommendations,
        };
        // Check if this alert already exists (avoid spam)
        const existingAlert = this.activeAlerts.get(alertId);
        if (existingAlert && Date.now() - existingAlert.timestamp < 300000) {
            // 5 minutes
            return;
        }
        // eslint-disable-next-line functional/immutable-data
        this.activeAlerts.set(alertId, alert);
        // Log alert
        const color = level === 'critical' ? colors.red : colors.yellow;
        console.log(color(`🚨 ${level.toUpperCase()} ALERT: ${message}`));
        // Emit alert event
        this.emit('alert', alert);
        // Generate recommendations if auto-scaling is enabled
        if (this.config.autoScalingEnabled) {
            this.generateScalingRecommendations(alert);
        }
    }
    /**
     * Track error rate for alerting
     */
    trackErrorRate(logEntry) {
        // This would need a more sophisticated implementation
        // For now, just create an alert for critical errors
        if (logEntry.level === 'FATAL') {
            this.createAlert('telemetry', 'fatal_error', 'critical', 1, 0, `Fatal error in ${logEntry.service}: ${logEntry.message}`);
        }
    }
    /**
     * Analyze metrics and detect performance issues
     */
    analyzeMetrics(metrics) {
        // Memory analysis
        if (metrics.memory.heapUsagePercent > this.config.alertThresholds.memoryCritical) {
            this.createAlert('memory', 'heap_usage', 'critical', metrics.memory.heapUsagePercent, this.config.alertThresholds.memoryCritical, `Critical memory usage: ${metrics.memory.heapUsagePercent.toFixed(1)}%`, ['Consider increasing heap size', 'Review memory leaks', 'Force garbage collection']);
        }
        // CPU analysis
        if (metrics.cpu.cpuUsagePercent > this.config.alertThresholds.cpuCritical) {
            this.createAlert('cpu', 'usage', 'critical', metrics.cpu.cpuUsagePercent, this.config.alertThresholds.cpuCritical, `Critical CPU usage: ${metrics.cpu.cpuUsagePercent.toFixed(1)}%`, ['Scale horizontally', 'Optimize algorithms', 'Review blocking operations']);
        }
        // WebSocket analysis
        if (metrics.websocket.averageLatency > this.config.alertThresholds.latencyCritical) {
            this.createAlert('websocket', 'latency', 'critical', metrics.websocket.averageLatency, this.config.alertThresholds.latencyCritical, `Critical WebSocket latency: ${metrics.websocket.averageLatency.toFixed(1)}ms`, ['Check network connectivity', 'Optimize message processing', 'Enable compression']);
        }
        // Execution analysis
        if (metrics.execution.successRate < 90) {
            // Less than 90% success rate
            this.createAlert('execution', 'success_rate', 'warning', metrics.execution.successRate, 90, `Low execution success rate: ${metrics.execution.successRate.toFixed(1)}%`, ['Check exchange connectivity', 'Review order parameters', 'Implement retry logic']);
        }
    }
    /**
     * Generate scaling recommendations
     */
    generateScalingRecommendations(alert) {
        // eslint-disable-next-line functional/no-let
        let recommendation = null;
        switch (alert.service) {
            case 'memory':
                if (alert.level === 'critical') {
                    recommendation = {
                        timestamp: Date.now(),
                        service: 'system',
                        action: 'scale_up',
                        reason: 'Critical memory usage detected',
                        priority: 'high',
                        estimatedImpact: 'Prevent out-of-memory crashes',
                    };
                }
                break;
            case 'cpu':
                if (alert.level === 'critical') {
                    recommendation = {
                        timestamp: Date.now(),
                        service: 'system',
                        action: 'scale_up',
                        reason: 'Critical CPU usage detected',
                        priority: 'high',
                        estimatedImpact: 'Improve response times and prevent bottlenecks',
                    };
                }
                break;
            case 'websocket':
                if (alert.metric === 'latency' && alert.level === 'critical') {
                    recommendation = {
                        timestamp: Date.now(),
                        service: 'websocket',
                        action: 'optimize',
                        reason: 'High WebSocket latency detected',
                        priority: 'medium',
                        estimatedImpact: 'Reduce message processing delays',
                    };
                }
                break;
        }
        if (recommendation) {
            // eslint-disable-next-line functional/immutable-data
            this.recommendations.push(recommendation);
            // Keep only last 50 recommendations
            if (this.recommendations.length > 50) {
                // eslint-disable-next-line functional/immutable-data
                this.recommendations = this.recommendations.slice(-50);
            }
            console.log(colors.cyan(`💡 Scaling recommendation: ${recommendation.action} ${recommendation.service} - ${recommendation.reason}`));
            this.emit('recommendation', recommendation);
        }
    }
    /**
     * Clean up old metrics data
     */
    cleanupOldMetrics() {
        const maxAge = this.config.metricsRetentionDays * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - maxAge;
        // eslint-disable-next-line functional/immutable-data
        this.metricsHistory = this.metricsHistory.filter((metrics) => metrics.timestamp > cutoff);
        // Clean up old alerts
        for (const [alertId, alert] of this.activeAlerts) {
            if (Date.now() - alert.timestamp > 3600000) {
                // 1 hour
                // eslint-disable-next-line functional/immutable-data
                this.activeAlerts.delete(alertId);
            }
        }
    }
    /**
     * Get current performance metrics
     */
    getCurrentMetrics() {
        return this.metricsHistory.length > 0
            ? this.metricsHistory[this.metricsHistory.length - 1]
            : null;
    }
    /**
     * Get metrics history
     */
    getMetricsHistory(hours = 24) {
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        return this.metricsHistory.filter((metrics) => metrics.timestamp > cutoff);
    }
    /**
     * Get active alerts
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    /**
     * Get scaling recommendations
     */
    getRecommendations() {
        return [...this.recommendations];
    }
    /**
     * Clear alert
     */
    clearAlert(alertId) {
        // eslint-disable-next-line functional/immutable-data
        return this.activeAlerts.delete(alertId);
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        // eslint-disable-next-line functional/immutable-data
        this.config = { ...this.config, ...config };
        console.log(colors.blue('⚙️ Performance monitor configuration updated'));
    }
    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        const currentMetrics = this.getCurrentMetrics();
        const criticalAlerts = Array.from(this.activeAlerts.values()).filter((alert) => alert.level === 'critical');
        return {
            isHealthy: criticalAlerts.length === 0,
            activeAlerts: this.activeAlerts.size,
            recommendations: this.recommendations.length,
            uptime: process.uptime(),
            lastMetricsUpdate: currentMetrics?.timestamp || 0,
        };
    }
    /**
     * Shutdown and cleanup
     */
    shutdown() {
        console.log(colors.blue('🛑 Shutting down Performance Monitor...'));
        this.stopMonitoring();
        // eslint-disable-next-line functional/immutable-data
        this.metricsHistory = [];
        // eslint-disable-next-line functional/immutable-data
        this.activeAlerts.clear();
        // eslint-disable-next-line functional/immutable-data
        this.recommendations = [];
    }
}
/**
 * Singleton Performance Monitor instance
 */
// eslint-disable-next-line functional/no-let
let performanceMonitorInstance = null;
/**
 * Get or create the global Performance Monitor instance
 */
export function getPerformanceMonitor(config) {
    if (!performanceMonitorInstance) {
        performanceMonitorInstance = new PerformanceMonitor(config);
    }
    return performanceMonitorInstance;
}
/**
 * Reset the global Performance Monitor instance (for testing)
 */
export function resetPerformanceMonitor() {
    if (performanceMonitorInstance) {
        performanceMonitorInstance.shutdown();
    }
    performanceMonitorInstance = null;
}
//# sourceMappingURL=PerformanceMonitor.js.map