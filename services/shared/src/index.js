"use strict";
/**
 * Shared Infrastructure Components for Titan Trading System
 *
 * This module exports all shared infrastructure components that can be used
 * across different Titan services for centralized management.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetNetworkOptimizer = exports.getNetworkOptimizer = exports.NetworkOptimizer = exports.DEFAULT_ORDER_ROUTER_CONFIG = exports.resetAdvancedOrderRouter = exports.getAdvancedOrderRouter = exports.AdvancedOrderRouter = exports.DEFAULT_HF_PROCESSOR_CONFIG = exports.resetHighFrequencyProcessor = exports.getHighFrequencyProcessor = exports.HighFrequencyProcessor = exports.DEFAULT_DISTRIBUTED_STATE_CONFIG = exports.resetDistributedStateManager = exports.getDistributedStateManager = exports.DistributedStateManager = exports.DEFAULT_SERVICE_DISCOVERY_CONFIG = exports.resetServiceDiscovery = exports.getServiceDiscovery = exports.ServiceDiscovery = exports.DEFAULT_LOAD_BALANCER_CONFIG = exports.LoadBalancer = exports.resetPerformanceMonitor = exports.getPerformanceMonitor = exports.PerformanceMonitor = exports.resetResourceOptimizer = exports.getResourceOptimizer = exports.ResourceOptimizer = exports.resetConfigVersionHistory = exports.getConfigVersionHistory = exports.ConfigVersionHistory = exports.createHotReloadConfigManager = exports.HotReloadConfigManager = exports.resetConfigEncryption = exports.getConfigEncryption = exports.ConfigEncryption = exports.createConfigLoader = exports.HierarchicalConfigLoader = exports.ConfigValidator = exports.resetConfigManager = exports.getConfigManager = exports.ConfigManager = exports.resetTelemetryService = exports.getTelemetryService = exports.TelemetryService = exports.resetExecutionService = exports.getExecutionService = exports.ExecutionService = exports.resetWebSocketManager = exports.getWebSocketManager = exports.WebSocketManager = void 0;
exports.DEFAULT_NETWORK_OPTIMIZER_CONFIG = void 0;
// WebSocket Management
var WebSocketManager_1 = require("./WebSocketManager");
Object.defineProperty(exports, "WebSocketManager", { enumerable: true, get: function () { return WebSocketManager_1.WebSocketManager; } });
Object.defineProperty(exports, "getWebSocketManager", { enumerable: true, get: function () { return WebSocketManager_1.getWebSocketManager; } });
Object.defineProperty(exports, "resetWebSocketManager", { enumerable: true, get: function () { return WebSocketManager_1.resetWebSocketManager; } });
// Execution Service
var ExecutionService_1 = require("./ExecutionService");
Object.defineProperty(exports, "ExecutionService", { enumerable: true, get: function () { return ExecutionService_1.ExecutionService; } });
Object.defineProperty(exports, "getExecutionService", { enumerable: true, get: function () { return ExecutionService_1.getExecutionService; } });
Object.defineProperty(exports, "resetExecutionService", { enumerable: true, get: function () { return ExecutionService_1.resetExecutionService; } });
// Telemetry Service
var TelemetryService_1 = require("./TelemetryService");
Object.defineProperty(exports, "TelemetryService", { enumerable: true, get: function () { return TelemetryService_1.TelemetryService; } });
Object.defineProperty(exports, "getTelemetryService", { enumerable: true, get: function () { return TelemetryService_1.getTelemetryService; } });
Object.defineProperty(exports, "resetTelemetryService", { enumerable: true, get: function () { return TelemetryService_1.resetTelemetryService; } });
// Configuration Management
var ConfigManager_1 = require("./ConfigManager");
Object.defineProperty(exports, "ConfigManager", { enumerable: true, get: function () { return ConfigManager_1.ConfigManager; } });
Object.defineProperty(exports, "getConfigManager", { enumerable: true, get: function () { return ConfigManager_1.getConfigManager; } });
Object.defineProperty(exports, "resetConfigManager", { enumerable: true, get: function () { return ConfigManager_1.resetConfigManager; } });
// Configuration Schema and Validation
var ConfigSchema_1 = require("./config/ConfigSchema");
Object.defineProperty(exports, "ConfigValidator", { enumerable: true, get: function () { return ConfigSchema_1.ConfigValidator; } });
// Hierarchical Configuration Loading
var HierarchicalConfigLoader_1 = require("./config/HierarchicalConfigLoader");
Object.defineProperty(exports, "HierarchicalConfigLoader", { enumerable: true, get: function () { return HierarchicalConfigLoader_1.HierarchicalConfigLoader; } });
Object.defineProperty(exports, "createConfigLoader", { enumerable: true, get: function () { return HierarchicalConfigLoader_1.createConfigLoader; } });
// Configuration Encryption
var ConfigEncryption_1 = require("./config/ConfigEncryption");
Object.defineProperty(exports, "ConfigEncryption", { enumerable: true, get: function () { return ConfigEncryption_1.ConfigEncryption; } });
Object.defineProperty(exports, "getConfigEncryption", { enumerable: true, get: function () { return ConfigEncryption_1.getConfigEncryption; } });
Object.defineProperty(exports, "resetConfigEncryption", { enumerable: true, get: function () { return ConfigEncryption_1.resetConfigEncryption; } });
// Hot-Reload Configuration Management
var HotReloadConfigManager_1 = require("./config/HotReloadConfigManager");
Object.defineProperty(exports, "HotReloadConfigManager", { enumerable: true, get: function () { return HotReloadConfigManager_1.HotReloadConfigManager; } });
Object.defineProperty(exports, "createHotReloadConfigManager", { enumerable: true, get: function () { return HotReloadConfigManager_1.createHotReloadConfigManager; } });
// Configuration Version History
var ConfigVersionHistory_1 = require("./config/ConfigVersionHistory");
Object.defineProperty(exports, "ConfigVersionHistory", { enumerable: true, get: function () { return ConfigVersionHistory_1.ConfigVersionHistory; } });
Object.defineProperty(exports, "getConfigVersionHistory", { enumerable: true, get: function () { return ConfigVersionHistory_1.getConfigVersionHistory; } });
Object.defineProperty(exports, "resetConfigVersionHistory", { enumerable: true, get: function () { return ConfigVersionHistory_1.resetConfigVersionHistory; } });
// Resource Optimization
var ResourceOptimizer_1 = require("./ResourceOptimizer");
Object.defineProperty(exports, "ResourceOptimizer", { enumerable: true, get: function () { return ResourceOptimizer_1.ResourceOptimizer; } });
Object.defineProperty(exports, "getResourceOptimizer", { enumerable: true, get: function () { return ResourceOptimizer_1.getResourceOptimizer; } });
Object.defineProperty(exports, "resetResourceOptimizer", { enumerable: true, get: function () { return ResourceOptimizer_1.resetResourceOptimizer; } });
// Performance Monitoring
var PerformanceMonitor_1 = require("./PerformanceMonitor");
Object.defineProperty(exports, "PerformanceMonitor", { enumerable: true, get: function () { return PerformanceMonitor_1.PerformanceMonitor; } });
Object.defineProperty(exports, "getPerformanceMonitor", { enumerable: true, get: function () { return PerformanceMonitor_1.getPerformanceMonitor; } });
Object.defineProperty(exports, "resetPerformanceMonitor", { enumerable: true, get: function () { return PerformanceMonitor_1.resetPerformanceMonitor; } });
// Load Balancing
var LoadBalancer_1 = require("./LoadBalancer");
Object.defineProperty(exports, "LoadBalancer", { enumerable: true, get: function () { return LoadBalancer_1.LoadBalancer; } });
Object.defineProperty(exports, "DEFAULT_LOAD_BALANCER_CONFIG", { enumerable: true, get: function () { return LoadBalancer_1.DEFAULT_LOAD_BALANCER_CONFIG; } });
// Service Discovery
var ServiceDiscovery_1 = require("./ServiceDiscovery");
Object.defineProperty(exports, "ServiceDiscovery", { enumerable: true, get: function () { return ServiceDiscovery_1.ServiceDiscovery; } });
Object.defineProperty(exports, "getServiceDiscovery", { enumerable: true, get: function () { return ServiceDiscovery_1.getServiceDiscovery; } });
Object.defineProperty(exports, "resetServiceDiscovery", { enumerable: true, get: function () { return ServiceDiscovery_1.resetServiceDiscovery; } });
Object.defineProperty(exports, "DEFAULT_SERVICE_DISCOVERY_CONFIG", { enumerable: true, get: function () { return ServiceDiscovery_1.DEFAULT_SERVICE_DISCOVERY_CONFIG; } });
// Distributed State Management
var DistributedStateManager_1 = require("./DistributedStateManager");
Object.defineProperty(exports, "DistributedStateManager", { enumerable: true, get: function () { return DistributedStateManager_1.DistributedStateManager; } });
Object.defineProperty(exports, "getDistributedStateManager", { enumerable: true, get: function () { return DistributedStateManager_1.getDistributedStateManager; } });
Object.defineProperty(exports, "resetDistributedStateManager", { enumerable: true, get: function () { return DistributedStateManager_1.resetDistributedStateManager; } });
Object.defineProperty(exports, "DEFAULT_DISTRIBUTED_STATE_CONFIG", { enumerable: true, get: function () { return DistributedStateManager_1.DEFAULT_DISTRIBUTED_STATE_CONFIG; } });
// High-Frequency Trading
var HighFrequencyProcessor_1 = require("./HighFrequencyProcessor");
Object.defineProperty(exports, "HighFrequencyProcessor", { enumerable: true, get: function () { return HighFrequencyProcessor_1.HighFrequencyProcessor; } });
Object.defineProperty(exports, "getHighFrequencyProcessor", { enumerable: true, get: function () { return HighFrequencyProcessor_1.getHighFrequencyProcessor; } });
Object.defineProperty(exports, "resetHighFrequencyProcessor", { enumerable: true, get: function () { return HighFrequencyProcessor_1.resetHighFrequencyProcessor; } });
Object.defineProperty(exports, "DEFAULT_HF_PROCESSOR_CONFIG", { enumerable: true, get: function () { return HighFrequencyProcessor_1.DEFAULT_HF_PROCESSOR_CONFIG; } });
// Advanced Order Routing
var AdvancedOrderRouter_1 = require("./AdvancedOrderRouter");
Object.defineProperty(exports, "AdvancedOrderRouter", { enumerable: true, get: function () { return AdvancedOrderRouter_1.AdvancedOrderRouter; } });
Object.defineProperty(exports, "getAdvancedOrderRouter", { enumerable: true, get: function () { return AdvancedOrderRouter_1.getAdvancedOrderRouter; } });
Object.defineProperty(exports, "resetAdvancedOrderRouter", { enumerable: true, get: function () { return AdvancedOrderRouter_1.resetAdvancedOrderRouter; } });
Object.defineProperty(exports, "DEFAULT_ORDER_ROUTER_CONFIG", { enumerable: true, get: function () { return AdvancedOrderRouter_1.DEFAULT_ORDER_ROUTER_CONFIG; } });
// Network Optimization
var NetworkOptimizer_1 = require("./NetworkOptimizer");
Object.defineProperty(exports, "NetworkOptimizer", { enumerable: true, get: function () { return NetworkOptimizer_1.NetworkOptimizer; } });
Object.defineProperty(exports, "getNetworkOptimizer", { enumerable: true, get: function () { return NetworkOptimizer_1.getNetworkOptimizer; } });
Object.defineProperty(exports, "resetNetworkOptimizer", { enumerable: true, get: function () { return NetworkOptimizer_1.resetNetworkOptimizer; } });
Object.defineProperty(exports, "DEFAULT_NETWORK_OPTIMIZER_CONFIG", { enumerable: true, get: function () { return NetworkOptimizer_1.DEFAULT_NETWORK_OPTIMIZER_CONFIG; } });
//# sourceMappingURL=index.js.map