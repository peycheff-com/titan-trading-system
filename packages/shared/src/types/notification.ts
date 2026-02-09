/**
 * Notification Taxonomy and Types
 * Defines the structure for all system notifications (Alerts, Toasts, Inbox)
 */

export type Severity = 'CRITICAL' | 'WARNING' | 'INFO' | 'SUCCESS';

export enum NotificationType {
  CIRCUIT_BREAKER = 'CIRCUIT_BREAKER',
  HIGH_CORRELATION = 'HIGH_CORRELATION',
  SWEEP_NOTIFICATION = 'SWEEP_NOTIFICATION',
  VETO_NOTIFICATION = 'VETO_NOTIFICATION',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
}

export interface ActionPath {
  type: 'link' | 'modal' | 'command';
  target: string; // URL, Route, or Command ID
  label: string;
}

export interface NotificationPayload {
  id: string; // UUID
  trace_id: string; // Correlation ID from backend
  source: 'brain' | 'market_data' | 'system' | 'user_action';
  severity: Severity;
  reason_code: string; // e.g., 'ORDER_REJECTED', 'MARGIN_CALL', 'CONNECTION_LOST'
  message: string;
  timestamp: number;
  count: number; // For deduping
  action_path?: ActionPath;
  receipt_id?: string; // Link to Receipts system
  metadata?: Record<string, unknown>;
  acknowledged: boolean;
  snoozed_until?: number;
}
