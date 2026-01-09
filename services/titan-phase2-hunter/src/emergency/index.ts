/**
 * Emergency Protocols Module
 * 
 * Exports all emergency protocol components for the 2026 modernization.
 * 
 * Task 8: Emergency Protocols and Failsafe Systems
 */

export { EmergencyProtocolManager, DEFAULT_EMERGENCY_CONFIG } from './EmergencyProtocolManager';

export type {
  EmergencyProtocolConfig,
  EmergencyTriggerResult,
  EmergencyAction,
  ComponentHealth,
  SystemHealthAssessment,
  EmergencyNotification,
  EmergencyLogEntry,
  EmergencyProtocolEvents
} from './EmergencyProtocolManager';
