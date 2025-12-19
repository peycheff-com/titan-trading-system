/**
 * Titan Production Deployment Services
 * 
 * Exports all deployment-related services including monitoring, alerting,
 * and metrics retention for production environments.
 */

// Monitoring Services
export {
  MonitoringService,
  getMonitoringService,
  resetMonitoringService,
  type SystemMetrics,
  type TradingMetrics,
  type MonitoringData,
  type MonitoringConfig,
  type PhaseMetrics
} from './MonitoringService';

export {
  AlertingService,
  getAlertingService,
  resetAlertingService,
  type Alert,
  type AlertThreshold,
  type AlertSeverity,
  type AlertCategory,
  type AlertChannel,
  type AlertingConfig,
  type EmailConfig,
  type SlackConfig,
  type WebhookConfig
} from './AlertingService';

export {
  MetricsRetentionService,
  getMetricsRetentionService,
  resetMetricsRetentionService,
  type RetentionPolicy,
  type StorageStats,
  type MetricsRetentionConfig
} from './MetricsRetentionService';

export {
  MonitoringOrchestrator,
  getMonitoringOrchestrator,
  resetMonitoringOrchestrator,
  type MonitoringSystemConfig,
  type MonitoringSystemStatus
} from './MonitoringOrchestrator';

// Deployment Services (existing)
export {
  DeploymentOrchestrator,
  type DeploymentConfig,
  type DeploymentResult,
  type ServiceConfig,
  type HealthCheckConfig
} from './DeploymentOrchestrator';

export {
  DeploymentValidator,
  type ValidationResult,
  type ValidationRule,
  type ValidationContext
} from './DeploymentValidator';

export {
  PM2Manager,
  type PM2Config,
  type ProcessInfo,
  type PM2Status
} from './PM2Manager';

// Backup and Recovery Services
export {
  BackupService,
  getBackupService,
  resetBackupService,
  type BackupConfig,
  type BackupResult,
  type BackupMetadata,
  type RestoreResult
} from './BackupService';

export {
  BackupScheduler,
  getBackupScheduler,
  resetBackupScheduler,
  DEFAULT_SCHEDULER_CONFIG,
  type SchedulerConfig,
  type ScheduledBackupResult
} from './BackupScheduler';

export {
  BackupStorageManager,
  getBackupStorageManager,
  resetBackupStorageManager,
  type StorageManagerConfig,
  type StorageLocation,
  type LocalStorageConfig,
  type CloudStorageConfig,
  type ReplicationStatus,
  type CleanupResult
} from './BackupStorageManager';

export {
  BackupIntegrityTester,
  getBackupIntegrityTester,
  resetBackupIntegrityTester,
  DEFAULT_INTEGRITY_TEST_CONFIG,
  type IntegrityTestConfig,
  type IntegrityTestResult,
  type TestSummary,
  type TestDetails,
  type FileIntegrityResult
} from './BackupIntegrityTester';

export {
  BackupOrchestrator,
  getBackupOrchestrator,
  resetBackupOrchestrator,
  DEFAULT_BACKUP_ORCHESTRATOR_CONFIG,
  type BackupOrchestratorConfig,
  type BackupSystemStatus,
  type BackupOperationResult
} from './BackupOrchestrator';

// Rollback System Services
export {
  VersionManager,
  type DeploymentVersion,
  type ServiceVersionInfo,
  type VersionMetadata,
  type VersionDependencies,
  type RollbackData,
  type RollbackInstruction,
  type VersionManagerConfig
} from './VersionManager';

export {
  RollbackOrchestrator,
  type RollbackConfig,
  type RollbackResult,
  type RollbackStepResult,
  type RollbackError,
  type RollbackProgress
} from './RollbackOrchestrator';

export {
  RollbackOptimizer,
  type OptimizationConfig,
  type ParallelOperation,
  type OptimizationResult,
  type PerformanceMetrics
} from './RollbackOptimizer';

export {
  RollbackSystem,
  getRollbackSystem,
  resetRollbackSystem,
  type RollbackSystemConfig,
  type RollbackSystemStatus
} from './RollbackSystem';

// Performance Optimization Services
export {
  PerformanceOptimizer,
  DEFAULT_PERFORMANCE_CONFIG,
  type PerformanceOptimizationConfig,
  type PerformanceMetrics as OptimizationPerformanceMetrics,
  type OptimizationResult
} from './PerformanceOptimizer';

export {
  NodeJSOptimizer,
  DEFAULT_NODEJS_CONFIG,
  type NodeJSOptimizationConfig,
  type OptimizationMetrics as NodeJSMetrics,
  type ConnectionPool
} from './NodeJSOptimizer';

export {
  RedisOptimizer,
  DEFAULT_REDIS_CONFIG,
  type RedisOptimizationConfig,
  type RedisMetrics,
  type RedisHealthCheck
} from './RedisOptimizer';

export {
  SystemOptimizer,
  DEFAULT_SYSTEM_CONFIG,
  type SystemOptimizationConfig,
  type SystemMetrics as SystemOptimizationMetrics,
  type LogRotationRule
} from './SystemOptimizer';

// Re-export shared services for convenience
export {
  getPerformanceMonitor,
  type PerformanceMetrics as SharedPerformanceMetrics,
  type PerformanceAlert
} from '../shared/src/PerformanceMonitor';

export {
  getTelemetryService,
  type LogLevel,
  type LogEntry
} from '../shared/src/TelemetryService';

export {
  getConfigManager,
  type BrainConfig,
  type PhaseConfig
} from '../shared/src/ConfigManager';