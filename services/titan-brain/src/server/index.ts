/**
 * Server Module - Barrel Export
 * Exports webhook server, signal queue, notification components, and integration services
 */

export { WebhookServer, WebhookServerConfig } from './WebhookServer.js';
export { SignalQueue, SignalQueueConfig } from './SignalQueue.js';
export { DashboardService } from './DashboardService.js';
export {
  CircuitBreakerNotification,
  HighCorrelationNotification,
  NotificationMessage,
  NotificationService,
  NotificationType,
  SweepNotification,
  VetoNotification,
} from './NotificationService.js';
export { TitanNotificationHandler } from './NotificationHandler.js';

// Integration services for connecting to Execution Engine and Phase services
export { ExecutionEngineClient } from './ExecutionEngineClient.js';
export {
  PhaseIntegrationConfig,
  PhaseIntegrationService,
  PhaseStatusUpdate,
  RawPhaseSignal,
  VetoNotification as PhaseVetoNotification,
} from './PhaseIntegrationService.js';
export {
  BinanceWalletProvider,
  BybitWalletProvider,
  setupDashboardService,
} from './DashboardIntegration.js';

export {
  Position as WSPosition,
  SensorStatus,
  Tripwire,
  WebSocketService,
  WebSocketServiceConfig,
  WSMessage,
  WSMessageType,
} from './WebSocketService.js';

// NATS Publisher for cross-service communication
export { AIOptimizationRequest, getNatsPublisher, NatsPublisher } from './NatsPublisher.js';

// Operator Command Plane
export { OperatorController } from './controllers/OperatorController.js';
