/**
 * Shared Infrastructure Components for Titan Trading System
 *
 * This module exports all shared infrastructure components that can be used
 * across different Titan services for centralized management.
 */
// WebSocket Management
export { WebSocketManager, getWebSocketManager, resetWebSocketManager } from './WebSocketManager';
// Execution Service
export { ExecutionService, getExecutionService, resetExecutionService } from './ExecutionService';
// Telemetry Service
export { TelemetryService, getTelemetryService, resetTelemetryService } from './TelemetryService';
// Configuration Management
export { ConfigManager } from './ConfigManager';
// Resource Optimization
export { ResourceOptimizer, getResourceOptimizer, resetResourceOptimizer } from './ResourceOptimizer';
// Performance Monitoring
export { PerformanceMonitor, getPerformanceMonitor, resetPerformanceMonitor } from './PerformanceMonitor';
// Load Balancing
export { LoadBalancer, DEFAULT_LOAD_BALANCER_CONFIG } from './LoadBalancer';
// Service Discovery
export { ServiceDiscovery, getServiceDiscovery, resetServiceDiscovery, DEFAULT_SERVICE_DISCOVERY_CONFIG } from './ServiceDiscovery';
// Distributed State Management
export { DistributedStateManager, getDistributedStateManager, resetDistributedStateManager, DEFAULT_DISTRIBUTED_STATE_CONFIG } from './DistributedStateManager';
//# sourceMappingURL=index.js.map