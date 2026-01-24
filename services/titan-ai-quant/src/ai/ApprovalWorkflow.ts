/**
 * ApprovalWorkflow - Handles proposal approval and rejection
 *
 * Implements the approval workflow for optimization proposals:
 * - Apply proposals by writing to config.json and triggering hot reload
 * - Reject proposals by logging rejection in strategic memory
 * - Tag applied config versions with proposal IDs
 * - Handle concurrent approval attempts with locking
 *
 * Requirements: 4.3, 4.4, 4.6
 */

import * as fs from 'fs';

import { StrategicMemory } from './StrategicMemory.js';
import type { Config, OptimizationProposal } from '../types/index.js';
import { safeValidateConfig } from '../config/ConfigSchema.js';
import { ErrorCode, getUserFriendlyMessage, logError, TitanError } from '../utils/ErrorHandler.js';

export interface ApprovalWorkflowOptions {
  /** Path to config.json file */
  configPath: string;
  /** Strategic memory instance for persistence */
  memory: StrategicMemory;
  /** Callback when config is updated (for hot reload) */
  onConfigUpdate?: (config: Config) => void;
  /** Callback when proposal is applied */
  onProposalApplied?: (proposal: OptimizationProposal, versionTag: string) => void;
  /** Callback when proposal is rejected */
  onProposalRejected?: (proposal: OptimizationProposal, reason: string) => void;
  /** Callback when an error occurs */
  onError?: (error: TitanError) => void;
}

export interface ApprovalResult {
  success: boolean;
  versionTag?: string;
  error?: string;
}

export interface RejectionResult {
  success: boolean;
  error?: string;
}

/**
 * Generate a unique version tag for config changes
 */
function generateVersionTag(proposalId: number): string {
  const timestamp = Date.now();
  return `v${timestamp}-p${proposalId}`;
}

/**
 * Set a nested value in an object using dot notation path
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  // eslint-disable-next-line functional/no-let
  let current: Record<string, unknown> = obj;

  // eslint-disable-next-line functional/no-let
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * ApprovalWorkflow class
 *
 * Manages the approval and rejection of optimization proposals with:
 * - Atomic config file updates
 * - Concurrent access locking
 * - Version tagging for tracking
 * - Hot reload support
 */
export class ApprovalWorkflow {
  private configPath: string;
  private memory: StrategicMemory;
  private onConfigUpdate?: (config: Config) => void;
  private onProposalApplied?: (proposal: OptimizationProposal, versionTag: string) => void;
  private onProposalRejected?: (proposal: OptimizationProposal, reason: string) => void;
  private onError?: (error: TitanError) => void;

  /** Lock to prevent concurrent approval attempts */
  private isLocked: boolean = false;
  private lockQueue: Array<() => void> = [];

  /** Last known good config for rollback */
  private lastKnownGoodConfig: Config | null = null;

  constructor(options: ApprovalWorkflowOptions) {
    this.configPath = options.configPath;
    this.memory = options.memory;
    this.onConfigUpdate = options.onConfigUpdate;
    this.onProposalApplied = options.onProposalApplied;
    this.onProposalRejected = options.onProposalRejected;
    this.onError = options.onError;

    // Load initial config as last known good
    try {
      if (fs.existsSync(this.configPath)) {
        this.lastKnownGoodConfig = this.loadConfig();
      }
    } catch {
      // Ignore - will be set on first successful apply
    }
  }

  /**
   * Acquire lock for exclusive access
   */
  private async acquireLock(): Promise<void> {
    if (!this.isLocked) {
      // eslint-disable-next-line functional/immutable-data
      this.isLocked = true;
      return;
    }

    // Wait for lock to be released
    return new Promise((resolve) => {
      // eslint-disable-next-line functional/immutable-data
      this.lockQueue.push(() => {
        // eslint-disable-next-line functional/immutable-data
        this.isLocked = true;
        resolve();
      });
    });
  }

  /**
   * Release lock and process next in queue
   */
  private releaseLock(): void {
    if (this.lockQueue.length > 0) {
      // eslint-disable-next-line functional/immutable-data
      const next = this.lockQueue.shift();
      next?.();
    } else {
      // eslint-disable-next-line functional/immutable-data
      this.isLocked = false;
    }
  }

  /**
   * Load current config from file
   */
  private loadConfig(): Config {
    const configContent = fs.readFileSync(this.configPath, 'utf-8');
    return JSON.parse(configContent) as Config;
  }

  /**
   * Save config to file atomically
   * Uses write-to-temp-then-rename pattern for atomicity
   */
  private saveConfig(config: Config): void {
    const tempPath = `${this.configPath}.tmp`;
    const backupPath = `${this.configPath}.backup`;

    // Create backup of current config
    if (fs.existsSync(this.configPath)) {
      fs.copyFileSync(this.configPath, backupPath);
    }

    // Write to temp file first
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');

    // Rename temp to actual (atomic on most filesystems)
    fs.renameSync(tempPath, this.configPath);
  }

  /**
   * Apply a proposal by writing to config.json and triggering hot reload
   *
   * Requirement 4.3: Apply proposal by writing to config.json and triggering hot reload
   * Requirement 4.6: Tag the specific config version in strategic memory
   * Task 15: Implement config rollback on hot reload failures
   *
   * @param proposal - The optimization proposal to apply
   * @returns ApprovalResult with success status and version tag
   */
  async applyProposal(proposal: OptimizationProposal): Promise<ApprovalResult> {
    // Validate proposal has an ID
    if (proposal.id === undefined) {
      const error = new TitanError(ErrorCode.CONFIG_VALIDATION_ERROR, 'Proposal must have an ID');
      this.handleError(error);
      return { success: false, error: getUserFriendlyMessage(error.code) };
    }

    // Validate proposal is pending
    if (proposal.status !== 'pending') {
      const error = new TitanError(
        ErrorCode.STALE_PROPOSAL,
        `Proposal is not pending (status: ${proposal.status})`,
        { proposalId: proposal.id, status: proposal.status },
      );
      this.handleError(error);
      return { success: false, error: getUserFriendlyMessage(error.code) };
    }

    // Acquire lock to prevent concurrent modifications
    await this.acquireLock();

    // eslint-disable-next-line functional/no-let
    let previousConfig: Config | null = null;

    try {
      // Load current config and save as backup for potential rollback
      previousConfig = this.loadConfig();

      // Create a mutable copy
      const newConfig = JSON.parse(JSON.stringify(previousConfig)) as Record<string, unknown>;

      // Apply the proposed change
      setNestedValue(newConfig, proposal.targetKey, proposal.suggestedValue);

      // Validate the new config against schema
      const validationResult = safeValidateConfig(newConfig) as {
        success: boolean;
        error?: { message: string };
        data?: unknown;
      };
      if (!validationResult.success) {
        const error = new TitanError(
          ErrorCode.CONFIG_VALIDATION_ERROR,
          `Config validation failed: ${
            (validationResult as { error: { message: string } }).error.message
          }`,
          {
            targetKey: proposal.targetKey,
            suggestedValue: proposal.suggestedValue,
          },
        );
        this.handleError(error);
        return {
          success: false,
          error: getUserFriendlyMessage(
            error.code,
            (validationResult as { error: { message: string } }).error.message,
          ),
        };
      }

      // Generate version tag
      const versionTag = generateVersionTag(proposal.id);

      // Save the new config atomically
      this.saveConfig(validationResult.data as unknown as Config);

      // Tag config version in strategic memory
      await this.memory.tagConfigVersion(
        versionTag,
        JSON.stringify(validationResult.data),
        proposal.id,
      );

      // Trigger hot reload callback with rollback on failure
      try {
        this.onConfigUpdate?.(validationResult.data as unknown as Config);
        // Update last known good config on successful hot reload
        // eslint-disable-next-line functional/immutable-data
        this.lastKnownGoodConfig = validationResult.data as unknown as Config;
      } catch (hotReloadError) {
        // Hot reload failed - rollback to previous config
        const error = new TitanError(
          ErrorCode.HOT_RELOAD_FAILURE,
          `Hot reload failed: ${
            hotReloadError instanceof Error ? hotReloadError.message : String(hotReloadError)
          }`,
          { versionTag, proposalId: proposal.id },
        );
        this.handleError(error);

        // Rollback to previous config
        if (previousConfig) {
          this.saveConfig(previousConfig);
          try {
            this.onConfigUpdate?.(previousConfig);
          } catch {
            // If rollback hot reload also fails, try last known good
            if (this.lastKnownGoodConfig) {
              this.saveConfig(this.lastKnownGoodConfig);
            }
          }
        }

        return {
          success: false,
          error: getUserFriendlyMessage(ErrorCode.HOT_RELOAD_FAILURE),
        };
      }

      // Notify listeners
      this.onProposalApplied?.(proposal, versionTag);

      return { success: true, versionTag };
    } catch (error) {
      const titanError =
        error instanceof TitanError
          ? error
          : new TitanError(
              ErrorCode.CONFIG_WRITE_FAILURE,
              error instanceof Error ? error.message : String(error),
              { proposalId: proposal.id },
            );
      this.handleError(titanError);

      // Attempt rollback on any error
      if (previousConfig) {
        try {
          this.saveConfig(previousConfig);
        } catch {
          // Last resort: try last known good config
          if (this.lastKnownGoodConfig) {
            try {
              this.saveConfig(this.lastKnownGoodConfig);
            } catch {
              // Log critical error - config may be in bad state
              logError(
                new TitanError(
                  ErrorCode.CONFIG_WRITE_FAILURE,
                  'Failed to rollback config - system may be in inconsistent state',
                ),
              );
            }
          }
        }
      }

      return { success: false, error: getUserFriendlyMessage(titanError.code) };
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Handle and log errors
   */
  private handleError(error: TitanError): void {
    logError(error);
    this.onError?.(error);
  }

  /**
   * Reject a proposal and log the rejection in strategic memory
   *
   * Requirement 4.4: Reject proposal and log rejection to prevent re-asking
   *
   * @param proposal - The optimization proposal to reject
   * @param reason - Optional reason for rejection
   * @returns RejectionResult with success status
   */
  async rejectProposal(
    proposal: OptimizationProposal,
    reason: string = 'User rejected',
  ): Promise<RejectionResult> {
    // Validate proposal has an ID
    if (proposal.id === undefined) {
      return { success: false, error: 'Proposal must have an ID' };
    }

    // Validate proposal is pending
    if (proposal.status !== 'pending') {
      return {
        success: false,
        error: `Proposal is not pending (status: ${proposal.status})`,
      };
    }

    // Acquire lock to prevent concurrent modifications
    await this.acquireLock();

    try {
      // Update proposal status to rejected
      await this.memory.updateProposalStatus(proposal.id, 'rejected');

      // Store rejection insight for future reference (prevents re-asking)
      await this.memory.storeInsight(
        'proposal_rejection',
        `Proposal ${proposal.id} for ${proposal.targetKey} was rejected. Reason: ${reason}. ` +
          `Suggested change: ${JSON.stringify(proposal.currentValue)} → ${JSON.stringify(
            proposal.suggestedValue,
          )}`,
        0.5, // Medium confidence - this is a user decision
      );

      // Notify listeners
      this.onProposalRejected?.(proposal, reason);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Rollback to a previous config version
   *
   * @param versionTag - The version tag to rollback to
   * @returns ApprovalResult with success status
   */
  async rollbackConfig(versionTag: string): Promise<ApprovalResult> {
    await this.acquireLock();

    try {
      // Get the config version from memory
      const configVersion = await this.memory.getConfigVersion(versionTag);
      if (!configVersion) {
        return {
          success: false,
          error: `Config version ${versionTag} not found`,
        };
      }

      // Parse and validate the stored config
      const config = JSON.parse(configVersion.configJson);
      const validationResult = safeValidateConfig(config) as {
        success: boolean;
        error?: { message: string };
        data?: unknown;
      };
      if (!validationResult.success) {
        return {
          success: false,
          error: `Stored config validation failed: ${
            (validationResult as { error: { message: string } }).error.message
          }`,
        };
      }

      // Save the config
      this.saveConfig(validationResult.data as unknown as Config);

      // Trigger hot reload callback
      this.onConfigUpdate?.(validationResult.data as unknown as Config);

      return { success: true, versionTag };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Check if the workflow is currently locked
   */
  isProcessing(): boolean {
    return this.isLocked;
  }
}

export default ApprovalWorkflow;
