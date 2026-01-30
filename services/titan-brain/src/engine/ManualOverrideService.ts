/**
 * Manual Override Service
 * Handles manual allocation overrides with operator authentication
 *
 * Requirements: 9.7, 9.8
 */

import { AllocationVector } from '../types/index.js';
import { DatabaseManager } from '../db/DatabaseManager.js';
import bcrypt from 'bcrypt';

export interface ManualOverride {
  id?: number;
  operatorId: string;
  originalAllocation: AllocationVector;
  overrideAllocation: AllocationVector;
  reason: string;
  timestamp: number;
  active: boolean;
  expiresAt?: number;
}

export interface OverrideRequest {
  operatorId: string;
  allocation: AllocationVector;
  reason: string;
  durationHours?: number; // Optional expiration
}

export interface OperatorCredentials {
  operatorId: string;
  hashedPassword: string;
  permissions: string[];
  lastLogin?: number;
}

export interface ManualOverrideConfig {
  maxOverrideDurationHours: number;
  requiredPermissions: string[];
  warningBannerTimeout: number;
}

/**
 * Service for handling manual allocation overrides
 */
export class ManualOverrideService {
  private readonly db: DatabaseManager;
  private readonly config: ManualOverrideConfig;
  private currentOverride: ManualOverride | null = null;
  private warningBannerActive: boolean = false;

  constructor(db: DatabaseManager, config: ManualOverrideConfig) {
    this.db = db;
    this.config = config;
  }

  /**
   * Initialize the service and load active overrides
   */
  async initialize(): Promise<void> {
    await this.loadActiveOverride();
    console.log('Manual Override Service initialized');
  }

  /**
   * Authenticate an operator
   * Requirement 9.7: Implement operator authentication
   *
   * @param operatorId - Operator identifier
   * @param password - Operator password
   * @returns True if authentication successful
   */
  async authenticateOperator(operatorId: string, password: string): Promise<boolean> {
    try {
      const credentials = await this.getOperatorCredentials(operatorId);
      if (!credentials) {
        console.warn(`Authentication failed: operator ${operatorId} not found`);
        return false;
      }

      // Use bcrypt for password verification
      const isValid = await bcrypt.compare(password, credentials.hashedPassword);
      if (!isValid) {
        console.warn(`Authentication failed: invalid password for operator ${operatorId}`);
        return false;
      }

      // Check permissions
      const hasRequiredPermissions = this.config.requiredPermissions.every((perm) =>
        credentials.permissions.includes(perm),
      );

      if (!hasRequiredPermissions) {
        console.warn(`Authentication failed: operator ${operatorId} lacks required permissions`);
        return false;
      }

      // Update last login
      await this.updateLastLogin(operatorId);

      console.log(`Operator ${operatorId} authenticated successfully`);
      return true;
    } catch (error) {
      console.error('Error authenticating operator:', error);
      return false;
    }
  }

  /**
   * Create a manual allocation override
   * Requirement 9.7: Create admin endpoint for allocation override
   *
   * @param request - Override request with operator credentials
   * @returns Created override or null if failed
   */
  async createOverride(request: OverrideRequest): Promise<ManualOverride | null> {
    try {
      // Validate allocation vector
      if (!this.validateAllocationVector(request.allocation)) {
        throw new Error('Invalid allocation vector: weights must sum to 1.0');
      }

      // Check if there's already an active override
      if (this.currentOverride && this.currentOverride.active) {
        throw new Error('Cannot create override: another override is already active');
      }

      // Get current allocation for comparison
      const currentAllocation = await this.getCurrentAllocation();

      // Calculate expiration time
      const durationHours = Math.min(
        request.durationHours || this.config.maxOverrideDurationHours,
        this.config.maxOverrideDurationHours,
      );
      const expiresAt = Date.now() + durationHours * 60 * 60 * 1000;

      // Create override record
      const override: ManualOverride = {
        operatorId: request.operatorId,
        originalAllocation: currentAllocation,
        overrideAllocation: request.allocation,
        reason: request.reason,
        timestamp: Date.now(),
        active: true,
        expiresAt,
      };

      // Persist to database
      const savedOverride = await this.saveOverride(override);

      this.currentOverride = savedOverride;

      // Activate warning banner
      this.activateWarningBanner();

      console.log(`Manual override created by operator ${request.operatorId}`);
      console.log(
        `Override allocation: w1=${request.allocation.w1}, w2=${request.allocation.w2}, w3=${request.allocation.w3}`,
      );
      console.log(`Expires at: ${new Date(expiresAt).toISOString()}`);

      return savedOverride;
    } catch (error) {
      console.error('Error creating manual override:', error);
      return null;
    }
  }

  /**
   * Deactivate the current manual override
   *
   * @param operatorId - Operator deactivating the override
   * @returns True if successfully deactivated
   */
  async deactivateOverride(operatorId: string): Promise<boolean> {
    try {
      if (!this.currentOverride || !this.currentOverride.active) {
        console.warn('No active override to deactivate');
        return false;
      }

      // Update override status in database
      await this.db.query(
        `UPDATE manual_overrides SET active = false, deactivated_by = $1, deactivated_at = $2 WHERE id = $3`,
        [operatorId, Date.now(), this.currentOverride.id],
      );

      // Clear current override

      this.currentOverride.active = false;

      this.currentOverride = null;

      // Deactivate warning banner
      this.deactivateWarningBanner();

      console.log(`Manual override deactivated by operator ${operatorId}`);
      return true;
    } catch (error) {
      console.error('Error deactivating manual override:', error);
      return false;
    }
  }

  /**
   * Get the current active override
   *
   * @returns Current override or null if none active
   */
  getCurrentOverride(): ManualOverride | null {
    // Check if override has expired
    if (
      this.currentOverride &&
      this.currentOverride.expiresAt &&
      Date.now() > this.currentOverride.expiresAt
    ) {
      this.expireOverride();
      return null;
    }

    return this.currentOverride;
  }

  /**
   * Get the effective allocation (override if active, otherwise normal)
   *
   * @param normalAllocation - Normal calculated allocation
   * @returns Effective allocation to use
   */
  getEffectiveAllocation(normalAllocation: AllocationVector): AllocationVector {
    const override = this.getCurrentOverride();

    if (override && override.active) {
      console.log('Using manual override allocation');
      return override.overrideAllocation;
    }

    return normalAllocation;
  }

  /**
   * Check if warning banner should be displayed
   * Requirement 9.8: Implement warning banner flag
   *
   * @returns True if warning banner should be shown
   */
  isWarningBannerActive(): boolean {
    return this.warningBannerActive;
  }

  /**
   * Get override history for an operator
   *
   * @param operatorId - Operator to get history for
   * @param limit - Maximum number of records to return
   * @returns Array of historical overrides
   */
  async getOverrideHistory(operatorId?: string, limit: number = 50): Promise<ManualOverride[]> {
    try {
      let query = `SELECT * FROM manual_overrides`;
      const params: any[] = [];

      if (operatorId) {
        query += ` WHERE operator_id = $1`;

        params.push(operatorId);
      }

      query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;

      params.push(limit);

      const rows = await this.db.queryAll<any>(query, params);
      return rows.map((row) => this.mapRowToOverride(row));
    } catch (error) {
      console.error('Error getting override history:', error);
      return [];
    }
  }

  /**
   * Get override statistics
   *
   * @returns Override usage statistics
   */
  async getOverrideStats(): Promise<{
    totalOverrides: number;
    activeOverrides: number;
    averageDurationHours: number;
    topOperators: Array<{ operatorId: string; count: number }>;
  }> {
    try {
      // Get total count
      const totalResult = await this.db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM manual_overrides`,
      );
      const totalOverrides = parseInt(totalResult?.count || '0', 10);

      // Get active count
      const activeResult = await this.db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM manual_overrides WHERE active = true`,
      );
      const activeOverrides = parseInt(activeResult?.count || '0', 10);

      // Get average duration
      const durationResult = await this.db.queryOne<{ avg_duration: string }>(
        `SELECT AVG(COALESCE(deactivated_at, expires_at) - timestamp) / 3600000 as avg_duration 
         FROM manual_overrides 
         WHERE expires_at IS NOT NULL`,
      );
      const averageDurationHours = parseFloat(durationResult?.avg_duration || '0');

      // Get top operators
      const operatorRows = await this.db.queryAll<{ operator_id: string; count: string }>(
        `SELECT operator_id, COUNT(*) as count 
         FROM manual_overrides 
         GROUP BY operator_id 
         ORDER BY count DESC 
         LIMIT 10`,
      );
      const topOperators = operatorRows.map((row) => ({
        operatorId: row.operator_id,
        count: parseInt(row.count, 10),
      }));

      return {
        totalOverrides,
        activeOverrides,
        averageDurationHours,
        topOperators,
      };
    } catch (error) {
      console.error('Error getting override stats:', error);
      return {
        totalOverrides: 0,
        activeOverrides: 0,
        averageDurationHours: 0,
        topOperators: [],
      };
    }
  }

  /**
   * Create a new operator account
   *
   * @param operatorId - Unique operator identifier
   * @param password - Operator password
   * @param permissions - Array of permissions
   * @returns True if created successfully
   */
  async createOperator(
    operatorId: string,
    password: string,
    permissions: string[],
  ): Promise<boolean> {
    try {
      const hashedPassword = this.hashPassword(password);

      await this.db.query(
        `INSERT INTO operators (operator_id, hashed_password, permissions, created_at)
         VALUES ($1, $2, $3, $4)`,
        [operatorId, hashedPassword, JSON.stringify(permissions), Date.now()],
      );

      console.log(`Operator ${operatorId} created with permissions:`, permissions);
      return true;
    } catch (error) {
      console.error('Error creating operator:', error);
      return false;
    }
  }

  // ============ Private Methods ============

  /**
   * Load active override from database on startup
   */
  private async loadActiveOverride(): Promise<void> {
    try {
      const row = await this.db.queryOne<any>(
        `SELECT * FROM manual_overrides WHERE active = true ORDER BY timestamp DESC LIMIT 1`,
      );

      if (row) {
        this.currentOverride = this.mapRowToOverride(row);

        // Check if override has expired
        if (this.currentOverride.expiresAt && Date.now() > this.currentOverride.expiresAt) {
          await this.expireOverride();
        } else {
          this.activateWarningBanner();
          console.log(`Loaded active override by operator ${this.currentOverride.operatorId}`);
        }
      }
    } catch (error) {
      console.error('Error loading active override:', error);
    }
  }

  /**
   * Get operator credentials from database
   */
  private async getOperatorCredentials(operatorId: string): Promise<OperatorCredentials | null> {
    try {
      const row = await this.db.queryOne<any>(`SELECT * FROM operators WHERE operator_id = $1`, [
        operatorId,
      ]);

      if (!row) return null;

      return {
        operatorId: row.operator_id,
        hashedPassword: row.hashed_password,
        permissions: JSON.parse(row.permissions || '[]'),
        lastLogin: row.last_login ? parseInt(row.last_login, 10) : undefined,
      };
    } catch (error) {
      console.error('Error getting operator credentials:', error);
      return null;
    }
  }

  /**
   * Update operator last login timestamp
   */
  private async updateLastLogin(operatorId: string): Promise<void> {
    try {
      await this.db.query(`UPDATE operators SET last_login = $1 WHERE operator_id = $2`, [
        Date.now(),
        operatorId,
      ]);
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  }

  /**
   * Get current allocation from database
   */
  private async getCurrentAllocation(): Promise<AllocationVector> {
    try {
      const row = await this.db.queryOne<any>(
        `SELECT * FROM allocation_history ORDER BY timestamp DESC LIMIT 1`,
      );

      if (row) {
        return {
          w1: parseFloat(row.w1),
          w2: parseFloat(row.w2),
          w3: parseFloat(row.w3),
          timestamp: parseInt(row.timestamp, 10),
        };
      }

      // Default allocation if none found
      return {
        w1: 1.0,
        w2: 0.0,
        w3: 0.0,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error getting current allocation:', error);
      // Return default allocation
      return {
        w1: 1.0,
        w2: 0.0,
        w3: 0.0,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Save override to database
   */
  private async saveOverride(override: ManualOverride): Promise<ManualOverride> {
    const row = await this.db.insert<any>('manual_overrides', {
      operator_id: override.operatorId,
      original_allocation: JSON.stringify(override.originalAllocation),
      override_allocation: JSON.stringify(override.overrideAllocation),
      reason: override.reason,
      timestamp: override.timestamp,
      active: override.active,
      expires_at: override.expiresAt || null,
    });

    return {
      ...override,
      id: row.id,
    };
  }

  /**
   * Map database row to ManualOverride
   */
  private mapRowToOverride(row: any): ManualOverride {
    return {
      id: row.id,
      operatorId: row.operator_id,
      originalAllocation: JSON.parse(row.original_allocation),
      overrideAllocation: JSON.parse(row.override_allocation),
      reason: row.reason,
      timestamp: parseInt(row.timestamp, 10),
      active: row.active,
      expiresAt: row.expires_at ? parseInt(row.expires_at, 10) : undefined,
    };
  }

  /**
   * Validate allocation vector
   */
  private validateAllocationVector(allocation: AllocationVector): boolean {
    const sum = allocation.w1 + allocation.w2 + allocation.w3;
    return (
      Math.abs(sum - 1.0) < 0.001 && allocation.w1 >= 0 && allocation.w2 >= 0 && allocation.w3 >= 0
    );
  }

  /**
   * Expire the current override
   */
  private async expireOverride(): Promise<void> {
    if (this.currentOverride && this.currentOverride.id) {
      await this.db.query(
        `UPDATE manual_overrides SET active = false, expired_at = $1 WHERE id = $2`,
        [Date.now(), this.currentOverride.id],
      );
    }

    this.currentOverride = null;
    this.deactivateWarningBanner();
    console.log('Manual override expired');
  }

  /**
   * Activate warning banner
   */
  private activateWarningBanner(): void {
    this.warningBannerActive = true;

    // Auto-deactivate after timeout
    setTimeout(() => {
      if (!this.getCurrentOverride()) {
        this.deactivateWarningBanner();
      }
    }, this.config.warningBannerTimeout);
  }

  /**
   * Deactivate warning banner
   */
  private deactivateWarningBanner(): void {
    this.warningBannerActive = false;
  }

  /**
   * Hash a password using bcrypt
   *
   * @param password - Plain text password
   * @returns Hashed password
   */
  private hashPassword(password: string): string {
    const SALT_ROUNDS = 12;
    return bcrypt.hashSync(password, SALT_ROUNDS);
  }
}
