# Titan Deployment Pipeline

A comprehensive deployment pipeline for the Titan Trading System with dependency-aware orchestration, PM2 process management, and extensive validation capabilities.

## Overview

The Titan Deployment Pipeline implements Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, and 7.3 from the production deployment specification. It provides:

- **Dependency-aware service deployment** with proper ordering
- **PM2 process management** with auto-restart and log rotation
- **Comprehensive validation** of services, Redis, and WebSocket connections
- **Health checks** with configurable timeouts and retry logic
- **Event-driven architecture** for monitoring deployment progress

## Components

### 1. DeploymentOrchestrator

Manages the deployment of Titan services in dependency order:

- **Service Dependencies**: Ensures shared infrastructure deploys before phase services
- **Health Checks**: Validates service startup within 30 seconds (Requirement 2.3)
- **Process Management**: Spawns and monitors service processes
- **Event Emission**: Provides real-time deployment progress updates

```typescript
import { DeploymentOrchestrator } from '@titan/deployment';

const orchestrator = new DeploymentOrchestrator();

// Deploy all services in dependency order
const result = await orchestrator.deployAll();

// Listen for deployment events
orchestrator.on('service:deployed', ({ service }) => {
  console.log(`Service ${service} deployed successfully`);
});
```

### 2. PM2Manager

Provides PM2 process management with production-grade configuration:

- **Auto-restart**: Configures PM2 with automatic restart on failure (Requirement 2.4)
- **Log Rotation**: Implements log rotation and compression (Requirement 2.5)
- **Memory Management**: Sets memory limits and restart thresholds
- **Process Monitoring**: Tracks CPU, memory, and uptime metrics

```typescript
import { PM2Manager } from '@titan/deployment';

const pm2Manager = new PM2Manager();

// Initialize PM2 and configure log rotation
await pm2Manager.initialize();

// Start all Titan services
await pm2Manager.startAll();

// Get process status
const processes = await pm2Manager.getProcessList();
```

### 3. DeploymentValidator

Validates deployment integrity with comprehensive health checks:

- **Service Validation**: Tests HTTP and TCP endpoints (Requirement 7.1)
- **Redis Connectivity**: Validates Redis connection and pub/sub (Requirement 7.3)
- **WebSocket Testing**: Tests exchange WebSocket connections (Requirement 7.2)
- **Timeout Management**: Ensures validation completes within specified timeouts

```typescript
import { DeploymentValidator } from '@titan/deployment';

const validator = new DeploymentValidator();

// Validate entire deployment
const result = await validator.validateDeployment();

// Quick health check
const health = await validator.quickHealthCheck();
```

## Service Dependencies

The deployment pipeline respects the following dependency order:

1. **Shared Infrastructure** (no dependencies)
2. **Security Services** (depends on shared)
3. **Titan Brain** (depends on shared, security)
4. **Titan Execution** (depends on shared, security, brain)
5. **Phase Services** (depend on brain, execution)
6. **Console** (depends on brain)

## Configuration

### Default Service Ports

- **titan-shared**: 3001
- **titan-security**: 3002
- **titan-brain**: 3000
- **titan-execution**: 3003
- **titan-phase1-scavenger**: 3004
- **titan-ai-quant**: 3005
- **titan-console**: 3006

### PM2 Configuration

Each service is configured with:

- **Auto-restart**: Enabled with 10 max restarts
- **Memory limits**: 200M-600M depending on service
- **Log rotation**: 10M max size, 30 day retention
- **Graceful shutdown**: 1.6s kill timeout
- **Monitoring**: CPU and memory tracking

### Validation Timeouts

- **Service startup**: 30 seconds (per Requirement 2.3)
- **Health checks**: 5 seconds per service (per Requirement 7.1)
- **WebSocket connections**: 10 seconds per exchange
- **Redis operations**: 5 seconds
- **Overall validation**: 30 seconds total

## Usage

### Complete Deployment

```typescript
import { TitanDeploymentPipeline } from '@titan/deployment';

const pipeline = new TitanDeploymentPipeline();

try {
  const result = await pipeline.deployToProduction();
  console.log('Deployment successful:', result);
} catch (error) {
  console.error('Deployment failed:', error.message);
}
```

### Individual Components

```typescript
// Use orchestrator only
const orchestrator = new DeploymentOrchestrator();
await orchestrator.deployAll();

// Use PM2 manager only
const pm2Manager = new PM2Manager();
await pm2Manager.startAll();

// Use validator only
const validator = new DeploymentValidator();
const result = await validator.validateDeployment();
```

## Event Monitoring

All components emit events for monitoring:

```typescript
// Deployment events
orchestrator.on('deployment:started', ({ services }) => {
  console.log('Starting deployment of:', services);
});

orchestrator.on('service:deployed', ({ service }) => {
  console.log(`Service ${service} deployed`);
});

// PM2 events
pm2Manager.on('pm2:started', () => {
  console.log('PM2 processes started');
});

// Validation events
validator.on('validation:completed', (result) => {
  console.log('Validation completed:', result.success);
});
```

## Error Handling

The pipeline provides comprehensive error handling:

- **Deployment failures**: Automatic rollback on service startup failure
- **Validation failures**: Stops deployment and provides detailed error information
- **Process crashes**: PM2 auto-restart with configurable limits
- **Network issues**: Retry logic with exponential backoff

## Testing

Run the test suite:

```bash
npm test
```

The tests cover:

- Service configuration validation
- Deployment order calculation
- PM2 ecosystem generation
- Health check functionality
- Error handling scenarios

## Requirements Compliance

This implementation satisfies the following requirements:

- **2.1**: Deploy Shared Infrastructure before Phase Services ✅
- **2.2**: Deploy Phase Services in dependency order ✅
- **2.3**: Validate service startup within 30 seconds ✅
- **2.4**: Configure PM2 with auto-restart and monitoring ✅
- **2.5**: Implement service log rotation and compression ✅
- **7.1**: Validate all services are running within 5 seconds ✅
- **7.2**: Test WebSocket connections to exchanges ✅
- **7.3**: Verify Redis connectivity and pub/sub functionality ✅

## Production Deployment

To deploy to production:

1. **Install dependencies**: `npm install`
2. **Build the service**: `npm run build`
3. **Configure environment**: Set up Redis, PM2, and service directories
4. **Run deployment**: Use the TitanDeploymentPipeline class
5. **Monitor logs**: Check PM2 logs and validation results

The deployment pipeline ensures institutional-grade reliability with comprehensive validation and monitoring capabilities.