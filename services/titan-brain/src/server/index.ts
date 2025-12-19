/**
 * Server Module - Barrel Export
 * Exports webhook server, signal queue, notification components, and integration services
 */

export { WebhookServer, WebhookServerConfig } from './WebhookServer.js';
export { SignalQueue, SignalQueueConfig } from './SignalQueue.js';
export { DashboardService } from './DashboardService.js';
export { 
  NotificationService,
  NotificationType,
  NotificationMessage,
  CircuitBreakerNotification,
  HighCorrelationNotification,
  SweepNotification,
  VetoNotification,
} from './NotificationService.js';
export { TitanNotificationHandler } from './NotificationHandler.js';

// Integration services for connecting to Execution Engine and Phase services
export { 
  ExecutionEngineClient,
  ExecutionEngineConfig,
  FillConfirmation,
  ExecutionPosition,
} from './ExecutionEngineClient.js';
export { 
  PhaseIntegrationService,
  PhaseIntegrationConfig,
  VetoNotification as PhaseVetoNotification,
  PhaseStatusUpdate,
  RawPhaseSignal,
} from './PhaseIntegrationService.js';
export {
  BybitWalletProvider,
  BinanceWalletProvider,
  setupDashboardService,
} from './DashboardIntegration.js';

// WebSocket service for real-time updates
export {
  WebSocketService,
  WebSocketServiceConfig,
  WSMessage,
  WSMessageType,
  Position as WSPosition,
  Tripwire,
  SensorStatus,
} from './WebSocketService.js';
