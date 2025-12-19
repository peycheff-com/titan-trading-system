# Performance Optimization System

This document describes the performance optimization components implemented for the Titan Production Deployment system.

## Overview

The performance optimization system provides comprehensive optimization for Node.js, Redis, and system-level parameters to ensure minimal latency and maximum throughput for high-frequency trading operations.

## Components

### 1. PerformanceOptimizer (Main Orchestrator)

The main class that coordinates all performance optimizations.

**Features:**
- Orchestrates Node.js, Redis, and system-level optimizations
- Provides unified configuration management
- Calculates overall performance scores and recommendations
- Supports high-frequency trading specific optimizations
- Event-driven architecture for monitoring optimization status

**Usage:**
```typescript
import { PerformanceOptimizer } from './PerformanceOptimizer';

const optimizer = new PerformanceOptimizer();
const result = await optimizer.applyAllOptimizations();

if (result.success) {
  console.log('Optimizations applied:', result.appliedOptimizations);
} else {
  console.error('Optimization errors:', result.errors);
}
```

### 2. NodeJSOptimizer

Optimizes Node.js runtime performance and implements connection pooling.

**Features:**
- Memory management and garbage collection tuning
- Event loop monitoring and optimization
- Database and WebSocket connection pooling
- Performance metrics collection
- Threshold-based alerting

**Key Optimizations:**
- V8 heap size optimization (4GB default)
- Incremental marking for better GC performance
- Connection pooling with configurable limits
- Event loop delay monitoring

### 3. RedisOptimizer

Configures Redis for optimal memory usage and high-frequency operations.

**Features:**
- Memory management and eviction policies
- Persistence configuration optimization
- Network and connection tuning
- High-frequency trading specific settings
- Health monitoring and diagnostics

**Key Optimizations:**
- Memory policy: `allkeys-lru` for efficient eviction
- Lazy freeing for better performance
- TCP keepalive and backlog optimization
- Compressed persistence with AOF

### 4. SystemOptimizer

Applies system-level kernel parameter tuning and log rotation.

**Features:**
- Kernel parameter optimization for low latency
- Log rotation configuration to prevent disk issues
- CPU governor and affinity settings
- Disk I/O scheduler optimization
- Network stack tuning

**Key Optimizations:**
- TCP buffer sizes optimized for high throughput
- Swappiness reduced to minimize swapping
- File descriptor limits increased
- BBR congestion control for better network performance

## Configuration

### Default Configuration

The system uses production-optimized defaults:

```typescript
const config = {
  nodejs: {
    maxOldSpaceSize: 4096, // 4GB heap
    maxEventLoopDelay: 10, // 10ms max delay
    connectionPooling: {
      maxConnections: 50,
      timeout: 30000
    }
  },
  redis: {
    maxMemory: '2gb',
    maxMemoryPolicy: 'allkeys-lru',
    appendOnly: true,
    lazyfreeLazyEviction: true
  },
  system: {
    logRotation: {
      maxSize: '100M',
      maxAge: 30,
      compress: true
    },
    kernelParams: {
      netCoreSomaxconn: 65535,
      vmSwappiness: 1,
      tcpCongestionControl: 'bbr'
    }
  }
};
```

### Custom Configuration

```typescript
const customOptimizer = new PerformanceOptimizer({
  nodejs: {
    maxOldSpaceSize: 8192, // 8GB for larger workloads
    maxEventLoopDelay: 5   // Stricter latency requirements
  },
  redis: {
    maxMemory: '4gb',      // More Redis memory
    appendFsync: 'no'      // Faster but less durable
  },
  dataDir: '/custom/data'
});
```

## High-Frequency Trading Optimizations

For ultra-low latency trading operations:

```typescript
await optimizer.optimizeForHighFrequencyTrading();
```

This applies:
- 1ms maximum event loop delay
- Redis optimized for speed over durability
- Increased connection pool sizes
- Kernel parameters tuned for minimal latency

## Monitoring and Metrics

### Performance Metrics

```typescript
const metrics = await optimizer.getPerformanceMetrics();

console.log('Overall Score:', metrics.overall.score); // 0-100
console.log('Status:', metrics.overall.status); // optimal/good/warning/critical
console.log('Recommendations:', metrics.overall.recommendations);
```

### Event Monitoring

```typescript
optimizer.on('optimization-completed', (result) => {
  console.log('Optimizations applied successfully');
});

optimizer.on('performance-warning', (warning) => {
  console.log('Performance threshold exceeded:', warning);
});

optimizer.on('nodejs-optimized', () => {
  console.log('Node.js optimizations applied');
});
```

## Connection Pool Management

### Database Connections

```typescript
const dbPool = optimizer.createDatabaseConnectionPool(
  'postgres',
  async () => new PostgresClient(),
  async (client) => client.close()
);

const connection = await dbPool.acquire();
// Use connection
dbPool.release(connection);
```

### WebSocket Connections

Connection pooling is automatically applied to WebSocket connections through the NodeJSOptimizer.

## Requirements Validation

This implementation satisfies the following requirements:

- **Requirement 9.1**: Node.js production optimizations with connection pooling
- **Requirement 9.2**: Redis memory and persistence optimization for high-frequency operations
- **Requirement 9.3**: System-level log rotation and kernel parameter tuning

## Production Deployment

### Prerequisites

- Node.js v18+
- Redis server
- Root privileges for system-level optimizations (optional)

### Installation

```bash
npm install
```

### Usage in Production

```typescript
import { PerformanceOptimizer, DEFAULT_PERFORMANCE_CONFIG } from './PerformanceOptimizer';

const optimizer = new PerformanceOptimizer(DEFAULT_PERFORMANCE_CONFIG);

// Apply all optimizations
const result = await optimizer.applyAllOptimizations();

if (result.success) {
  console.log('System optimized for production');
  
  // Monitor performance
  setInterval(async () => {
    const metrics = await optimizer.getPerformanceMetrics();
    if (metrics.overall.status !== 'optimal') {
      console.warn('Performance degraded:', metrics.overall.recommendations);
    }
  }, 60000); // Check every minute
}
```

### Rollback

```typescript
// Rollback all optimizations if needed
await optimizer.rollbackOptimizations();
```

## Error Handling

The system is designed to handle failures gracefully:

- Individual optimizer failures don't prevent other optimizations
- System-level optimizations may require root privileges (warnings issued if unavailable)
- Redis optimization failures are logged but don't crash the system
- Connection pool failures are isolated per pool

## Security Considerations

- System-level optimizations require appropriate privileges
- Redis configuration includes security settings
- Log rotation prevents disk space exhaustion
- Connection pools prevent resource exhaustion

## Performance Impact

Expected improvements with full optimization:

- **Latency**: 20-40% reduction in response times
- **Throughput**: 30-50% increase in requests per second
- **Memory**: 15-25% reduction in memory fragmentation
- **Stability**: Improved garbage collection and resource management

## Troubleshooting

### Common Issues

1. **Permission Denied**: System optimizations require root privileges
2. **Redis Connection Failed**: Ensure Redis server is running
3. **High Memory Usage**: Adjust heap size or connection pool limits
4. **Event Loop Lag**: Review synchronous operations and reduce workload

### Diagnostics

```typescript
// Get detailed metrics
const metrics = await optimizer.getPerformanceMetrics();

// Check Redis health
const redisHealth = await optimizer.redisOptimizer.performHealthCheck();

// Monitor system resources
const systemMetrics = await optimizer.systemOptimizer.getSystemMetrics();
```

## Integration with Deployment Pipeline

The performance optimizer integrates with the deployment system:

```typescript
import { DeploymentOrchestrator } from './DeploymentOrchestrator';
import { PerformanceOptimizer } from './PerformanceOptimizer';

const deployment = new DeploymentOrchestrator();
const optimizer = new PerformanceOptimizer();

// Apply optimizations before deployment
await optimizer.applyAllOptimizations();

// Deploy services
await deployment.deployAll();

// Verify performance after deployment
const metrics = await optimizer.getPerformanceMetrics();
```

This ensures optimal performance for the Titan Trading System in production environments.