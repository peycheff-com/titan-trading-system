/**
 * PhaseIntegrationService - Integration with Titan Phase Services
 *
 * Handles webhook reception from Phase 1 (Scavenger), Phase 2 (Hunter), and Phase 3 (Sentinel).
 * Implements phase notification endpoints for veto notifications and status updates.
 *
 * Requirements: 7.4, 7.6
 */

import { EventEmitter } from 'events';
import { createHmac } from 'crypto';
import { IntentSignal, PhaseId } from '../types/index.js';
import { PhaseNotifier } from '../engine/TitanBrain.js';

/**
 * Configuration for Phase Integration Service
 */
export interface PhaseIntegrationConfig {
  /** Phase 1 (Scavenger) webhook URL for notifications */
  phase1WebhookUrl?: string;
  /** Phase 2 (Hunter) webhook URL for notifications */
  phase2WebhookUrl?: string;
  /** Phase 3 (Sentinel) webhook URL for notifications */
  phase3WebhookUrl?: string;
  /** HMAC secret for request signing */
  hmacSecret?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
}

/**
 * Phase webhook configuration
 */
interface PhaseWebhookConfig {
  url: string;
  enabled: boolean;
  lastContact: number;
  healthy: boolean;
}

/**
 * Veto notification payload
 */
export interface VetoNotification {
  signalId: string;
  phaseId: PhaseId;
  symbol: string;
  reason: string;
  requestedSize: number;
  timestamp: number;
}

/**
 * Phase status update payload
 */
export interface PhaseStatusUpdate {
  phaseId: PhaseId;
  status: 'active' | 'inactive' | 'throttled' | 'paused';
  allocation: number;
  approvalRate: number;
  message?: string;
  timestamp: number;
}

/**
 * Raw signal from Phase services
 */
export interface RawPhaseSignal {
  signal_id: string;
  source: 'scavenger' | 'hunter' | 'sentinel';
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size?: number;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number[];
  leverage?: number;
  confidence?: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<PhaseIntegrationConfig> = {
  timeout: 5000,
  maxRetries: 2,
};

/**
 * Map source string to PhaseId
 */
const SOURCE_TO_PHASE: Record<string, PhaseId> = {
  scavenger: 'phase1',
  hunter: 'phase2',
  sentinel: 'phase3',
};

/**
 * PhaseIntegrationService handles communication with Phase services
 */
export class PhaseIntegrationService extends EventEmitter implements PhaseNotifier {
  private readonly config: PhaseIntegrationConfig;
  private readonly phaseWebhooks: Map<PhaseId, PhaseWebhookConfig> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: PhaseIntegrationConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializePhaseWebhooks();
  }

  /**
   * Initialize phase webhook configurations
   */
  private initializePhaseWebhooks(): void {
    if (this.config.phase1WebhookUrl) {
      this.phaseWebhooks.set('phase1', {
        url: this.config.phase1WebhookUrl,
        enabled: true,
        lastContact: 0,
        healthy: false,
      });
    }

    if (this.config.phase2WebhookUrl) {
      this.phaseWebhooks.set('phase2', {
        url: this.config.phase2WebhookUrl,
        enabled: true,
        lastContact: 0,
        healthy: false,
      });
    }

    if (this.config.phase3WebhookUrl) {
      this.phaseWebhooks.set('phase3', {
        url: this.config.phase3WebhookUrl,
        enabled: true,
        lastContact: 0,
        healthy: false,
      });
    }
  }

  /**
   * Initialize the service and start health checks
   */
  async initialize(): Promise<void> {
    console.log('🔗 Initializing Phase Integration Service...');

    // Test connections to configured phases
    for (const [phaseId, webhook] of this.phaseWebhooks) {
      if (webhook.enabled) {
        const healthy = await this.checkPhaseHealth(phaseId);
        console.log(`  ${phaseId}: ${healthy ? '✅ Connected' : '⚠️ Not available'}`);
      }
    }

    // Start periodic health checks
    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllPhasesHealth();
    }, 60000); // Every 60 seconds

    console.log('✅ Phase Integration Service initialized');
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    console.log('🔌 Phase Integration Service shutdown');
  }

  /**
   * Transform raw phase signal to IntentSignal
   * Requirement 7.4: Maintain signal queue with timestamps and phase source
   */
  transformSignal(rawSignal: RawPhaseSignal): IntentSignal {
    const phaseId = SOURCE_TO_PHASE[rawSignal.source];

    if (!phaseId) {
      throw new Error(`Unknown signal source: ${rawSignal.source}`);
    }

    return {
      signalId: rawSignal.signal_id,
      phaseId,
      symbol: rawSignal.symbol,
      side: rawSignal.direction === 'LONG' ? 'BUY' : 'SELL',
      requestedSize: rawSignal.size || 0,
      timestamp: rawSignal.timestamp || Date.now(),
      leverage: rawSignal.leverage,
    };
  }

  /**
   * Validate incoming signal from Phase service
   */
  validateSignal(rawSignal: RawPhaseSignal): { valid: boolean; error?: string } {
    if (!rawSignal.signal_id) {
      return { valid: false, error: 'Missing signal_id' };
    }

    if (!rawSignal.source || !SOURCE_TO_PHASE[rawSignal.source]) {
      return { valid: false, error: `Invalid source: ${rawSignal.source}` };
    }

    if (!rawSignal.symbol) {
      return { valid: false, error: 'Missing symbol' };
    }

    if (!rawSignal.direction || !['LONG', 'SHORT'].includes(rawSignal.direction)) {
      return { valid: false, error: `Invalid direction: ${rawSignal.direction}` };
    }

    return { valid: true };
  }

  /**
   * Notify a phase of a signal veto
   * Requirement 7.6: Log the reason and notify the originating phase
   */
  async notifyVeto(phaseId: PhaseId, signalId: string, reason: string): Promise<void> {
    const webhook = this.phaseWebhooks.get(phaseId);

    if (!webhook || !webhook.enabled) {
      console.log(
        `📢 Veto notification for ${phaseId} (no webhook configured): ${signalId} - ${reason}`,
      );
      return;
    }

    const notification: VetoNotification = {
      signalId,
      phaseId,
      symbol: '', // Will be filled by caller if needed
      reason,
      requestedSize: 0,
      timestamp: Date.now(),
    };

    try {
      await this.sendNotification(webhook.url, '/brain/veto', notification);
      console.log(`📢 Veto notification sent to ${phaseId}: ${signalId}`);

      this.emit('veto:sent', notification);
    } catch (error) {
      console.error(`❌ Failed to send veto notification to ${phaseId}:`, error);
      this.emit('veto:failed', { ...notification, error });
    }
  }

  /**
   * Send status update to a phase
   */
  async sendStatusUpdate(update: PhaseStatusUpdate): Promise<void> {
    const webhook = this.phaseWebhooks.get(update.phaseId);

    if (!webhook || !webhook.enabled) {
      return;
    }

    try {
      await this.sendNotification(webhook.url, '/brain/status', update);
      console.log(`📊 Status update sent to ${update.phaseId}: ${update.status}`);
    } catch (error) {
      console.error(`❌ Failed to send status update to ${update.phaseId}:`, error);
    }
  }

  /**
   * Broadcast status update to all phases
   */
  async broadcastStatusUpdate(
    status: 'active' | 'inactive' | 'throttled' | 'paused',
    allocations: Record<PhaseId, number>,
    approvalRates: Record<PhaseId, number>,
    message?: string,
  ): Promise<void> {
    const timestamp = Date.now();

    for (const phaseId of ['phase1', 'phase2', 'phase3'] as PhaseId[]) {
      const update: PhaseStatusUpdate = {
        phaseId,
        status,
        allocation: allocations[phaseId] || 0,
        approvalRate: approvalRates[phaseId] || 1.0,
        message,
        timestamp,
      };

      await this.sendStatusUpdate(update);
    }
  }

  /**
   * Notify phase of allocation change
   */
  async notifyAllocationChange(
    phaseId: PhaseId,
    newAllocation: number,
    reason: string,
  ): Promise<void> {
    const webhook = this.phaseWebhooks.get(phaseId);

    if (!webhook || !webhook.enabled) {
      return;
    }

    const notification = {
      type: 'allocation_change',
      phaseId,
      newAllocation,
      reason,
      timestamp: Date.now(),
    };

    try {
      await this.sendNotification(webhook.url, '/brain/allocation', notification);
      console.log(
        `📊 Allocation change notification sent to ${phaseId}: ${(newAllocation * 100).toFixed(1)}%`,
      );
    } catch (error) {
      console.error(`❌ Failed to send allocation notification to ${phaseId}:`, error);
    }
  }

  /**
   * Notify phase of circuit breaker activation
   */
  async notifyCircuitBreaker(reason: string): Promise<void> {
    const notification = {
      type: 'circuit_breaker',
      status: 'active',
      reason,
      timestamp: Date.now(),
    };

    for (const [phaseId, webhook] of this.phaseWebhooks) {
      if (webhook.enabled) {
        try {
          await this.sendNotification(webhook.url, '/brain/circuit-breaker', notification);
          console.log(`🚨 Circuit breaker notification sent to ${phaseId}`);
        } catch (error) {
          console.error(`❌ Failed to send circuit breaker notification to ${phaseId}:`, error);
        }
      }
    }
  }

  /**
   * Check health of a specific phase
   */
  async checkPhaseHealth(phaseId: PhaseId): Promise<boolean> {
    const webhook = this.phaseWebhooks.get(phaseId);

    if (!webhook || !webhook.enabled) {
      return false;
    }

    try {
      const response = await this.makeRequest(webhook.url, '/health', 'GET', undefined, 2000);
      webhook.healthy = response.status === 'healthy' || response.status === 'ok';
      webhook.lastContact = Date.now();
      return webhook.healthy;
    } catch (error) {
      webhook.healthy = false;
      return false;
    }
  }

  /**
   * Check health of all phases
   */
  async checkAllPhasesHealth(): Promise<Record<PhaseId, boolean>> {
    const results: Record<PhaseId, boolean> = {
      phase1: false,
      phase2: false,
      phase3: false,
    };

    for (const phaseId of ['phase1', 'phase2', 'phase3'] as PhaseId[]) {
      results[phaseId] = await this.checkPhaseHealth(phaseId);
    }

    return results;
  }

  /**
   * Get phase webhook status
   */
  getPhaseStatus(phaseId: PhaseId): PhaseWebhookConfig | undefined {
    return this.phaseWebhooks.get(phaseId);
  }

  /**
   * Get all phase statuses
   */
  getAllPhaseStatuses(): Record<PhaseId, PhaseWebhookConfig | null> {
    return {
      phase1: this.phaseWebhooks.get('phase1') || null,
      phase2: this.phaseWebhooks.get('phase2') || null,
      phase3: this.phaseWebhooks.get('phase3') || null,
    };
  }

  /**
   * Register a phase webhook URL
   */
  registerPhaseWebhook(phaseId: PhaseId, url: string): void {
    this.phaseWebhooks.set(phaseId, {
      url,
      enabled: true,
      lastContact: 0,
      healthy: false,
    });
    console.log(`📝 Registered webhook for ${phaseId}: ${url}`);
  }

  /**
   * Unregister a phase webhook
   */
  unregisterPhaseWebhook(phaseId: PhaseId): void {
    this.phaseWebhooks.delete(phaseId);
    console.log(`📝 Unregistered webhook for ${phaseId}`);
  }

  /**
   * Send notification to a phase
   */
  private async sendNotification(baseUrl: string, path: string, payload: unknown): Promise<void> {
    await this.makeRequest(baseUrl, path, 'POST', payload);
  }

  /**
   * Make HTTP request to Phase service
   */
  private async makeRequest(
    baseUrl: string,
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
    timeout?: number,
  ): Promise<any> {
    const url = `${baseUrl}${path}`;
    const requestTimeout = timeout || this.config.timeout || 5000;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add HMAC signature if secret is configured
    if (this.config.hmacSecret && body) {
      const bodyString = JSON.stringify(body);
      const signature = createHmac('sha256', this.config.hmacSecret)
        .update(bodyString)
        .digest('hex');
      headers['x-signature'] = signature;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    const maxRetries = this.config.maxRetries || 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          await this.delay(500 * attempt);
        }
      }
    }

    clearTimeout(timeoutId);
    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
