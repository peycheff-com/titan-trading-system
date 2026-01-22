/**
 * Distributed State Manager for Titan Trading System
 *
 * Provides distributed state management and synchronization across
 * multiple service instances with conflict resolution and consistency guarantees.
 *
 * Requirements: 10.1 - Distributed state management and synchronization
 */

import { EventEmitter } from 'eventemitter3';
import { createHash } from 'crypto';

// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
};

/**
 * State entry with versioning and metadata
 */
export interface StateEntry<T = any> {
  key: string;
  value: T;
  version: number;
  timestamp: number;
  nodeId: string;
  checksum: string;
  metadata: Record<string, any>;
  ttl?: number; // Time to live in milliseconds
}

/**
 * State change operation
 */
export interface StateOperation {
  type: 'SET' | 'DELETE' | 'INCREMENT' | 'DECREMENT' | 'APPEND' | 'MERGE';
  key: string;
  value?: any;
  delta?: number;
  expectedVersion?: number;
  nodeId: string;
  timestamp: number;
}

/**
 * Conflict resolution strategy
 */
export type ConflictResolutionStrategy =
  | 'last_write_wins'
  | 'first_write_wins'
  | 'highest_version'
  | 'custom'
  | 'merge';

/**
 * Consistency level
 */
export type ConsistencyLevel = 'eventual' | 'strong' | 'bounded_staleness';

/**
 * Distributed state configuration
 */
export interface DistributedStateConfig {
  nodeId: string;
  consistencyLevel: ConsistencyLevel;
  conflictResolution: ConflictResolutionStrategy;
  syncInterval: number; // milliseconds
  maxSyncRetries: number;
  syncTimeout: number; // milliseconds
  enableCompression: boolean;
  enableEncryption: boolean;
  maxStateSize: number; // bytes
  enableMetrics: boolean;
  replicationFactor: number; // Number of nodes to replicate to
  enableTTL: boolean;
  defaultTTL: number; // milliseconds
}

/**
 * Sync message types
 */
export interface SyncMessage {
  type: 'SYNC_REQUEST' | 'SYNC_RESPONSE' | 'STATE_UPDATE' | 'CONFLICT_RESOLUTION';
  fromNode: string;
  toNode?: string; // undefined for broadcast
  timestamp: number;
  data: any;
  messageId: string;
}

/**
 * Node information
 */
export interface NodeInfo {
  id: string;
  host: string;
  port: number;
  lastSeen: number;
  isOnline: boolean;
  stateVersion: number;
  capabilities: string[];
}

/**
 * Conflict resolver interface
 */
export interface ConflictResolver<T = any> {
  resolve(local: StateEntry<T>, remote: StateEntry<T>): StateEntry<T>;
}

/**
 * Default conflict resolvers
 */
export class LastWriteWinsResolver<T> implements ConflictResolver<T> {
  resolve(local: StateEntry<T>, remote: StateEntry<T>): StateEntry<T> {
    return local.timestamp > remote.timestamp ? local : remote;
  }
}

export class HighestVersionResolver<T> implements ConflictResolver<T> {
  resolve(local: StateEntry<T>, remote: StateEntry<T>): StateEntry<T> {
    return local.version > remote.version ? local : remote;
  }
}

export class MergeResolver<T> implements ConflictResolver<T> {
  resolve(local: StateEntry<T>, remote: StateEntry<T>): StateEntry<T> {
    // Simple merge strategy - combine objects or use latest for primitives
    if (typeof local.value === 'object' && typeof remote.value === 'object') {
      const merged = { ...local.value, ...remote.value };
      return {
        ...local,
        value: merged as T,
        version: Math.max(local.version, remote.version) + 1,
        timestamp: Math.max(local.timestamp, remote.timestamp),
      };
    }

    // For non-objects, use last write wins
    return local.timestamp > remote.timestamp ? local : remote;
  }
}

/**
 * State synchronization manager
 */
class StateSynchronizer extends EventEmitter {
  private syncTimer: NodeJS.Timeout | null = null;
  private pendingSyncs = new Map<string, NodeJS.Timeout>();

  constructor(
    private config: DistributedStateConfig,
    private stateStore: Map<string, StateEntry>,
    private nodes: Map<string, NodeInfo>,
  ) {
    super();
  }

  /**
   * Start synchronization
   */
  start(): void {
    if (this.syncTimer) {
      return;
    }

    // eslint-disable-next-line functional/immutable-data
    this.syncTimer = setInterval(() => {
      this.performSync();
    }, this.config.syncInterval);

    console.log(
      colors.green(`🔄 State synchronization started (${this.config.syncInterval}ms interval)`),
    );
  }

  /**
   * Stop synchronization
   */
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      // eslint-disable-next-line functional/immutable-data
      this.syncTimer = null;
    }

    // Clear pending syncs
    for (const timer of this.pendingSyncs.values()) {
      clearTimeout(timer);
    }
    // eslint-disable-next-line functional/immutable-data
    this.pendingSyncs.clear();
  }

  /**
   * Perform synchronization with other nodes
   */
  private async performSync(): Promise<void> {
    const onlineNodes = Array.from(this.nodes.values()).filter(
      (node) => node.isOnline && node.id !== this.config.nodeId,
    );

    if (onlineNodes.length === 0) {
      return;
    }

    // Select nodes to sync with based on replication factor
    const syncNodes = this.selectSyncNodes(onlineNodes);

    for (const node of syncNodes) {
      try {
        await this.syncWithNode(node);
      } catch (error) {
        console.error(colors.red(`❌ Sync failed with node ${node.id}:`), error);
      }
    }
  }

  /**
   * Select nodes for synchronization
   */
  private selectSyncNodes(availableNodes: NodeInfo[]): NodeInfo[] {
    // For now, sync with all available nodes up to replication factor
    return availableNodes.slice(0, this.config.replicationFactor);
  }

  /**
   * Sync with specific node
   */
  private async syncWithNode(node: NodeInfo): Promise<void> {
    const syncMessage: SyncMessage = {
      type: 'SYNC_REQUEST',
      fromNode: this.config.nodeId,
      toNode: node.id,
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      data: {
        stateVersion: this.getStateVersion(),
        keys: Array.from(this.stateStore.keys()),
      },
    };

    // Send sync request (in real implementation, this would use network communication)
    this.emit('syncMessage', syncMessage);
  }

  /**
   * Handle incoming sync message
   */
  async handleSyncMessage(message: SyncMessage): Promise<void> {
    switch (message.type) {
      case 'SYNC_REQUEST':
        await this.handleSyncRequest(message);
        break;
      case 'SYNC_RESPONSE':
        await this.handleSyncResponse(message);
        break;
      case 'STATE_UPDATE':
        await this.handleStateUpdate(message);
        break;
      case 'CONFLICT_RESOLUTION':
        await this.handleConflictResolution(message);
        break;
    }
  }

  /**
   * Handle sync request from another node
   */
  private async handleSyncRequest(message: SyncMessage): Promise<void> {
    const { stateVersion, keys } = message.data;
    const localVersion = this.getStateVersion();

    // Determine what state to send back
    const stateDiff = this.calculateStateDiff(keys, stateVersion);

    const response: SyncMessage = {
      type: 'SYNC_RESPONSE',
      fromNode: this.config.nodeId,
      toNode: message.fromNode,
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      data: {
        stateVersion: localVersion,
        stateDiff,
      },
    };

    this.emit('syncMessage', response);
  }

  /**
   * Handle sync response from another node
   */
  private async handleSyncResponse(message: SyncMessage): Promise<void> {
    const { stateDiff } = message.data;

    for (const entry of stateDiff) {
      await this.mergeRemoteState(entry);
    }
  }

  /**
   * Handle state update from another node
   */
  private async handleStateUpdate(message: SyncMessage): Promise<void> {
    const { operation } = message.data;
    await this.applyRemoteOperation(operation);
  }

  /**
   * Handle conflict resolution
   */
  private async handleConflictResolution(message: SyncMessage): Promise<void> {
    const { key, resolvedEntry } = message.data;

    // Apply resolved state
    // eslint-disable-next-line functional/immutable-data
    this.stateStore.set(key, resolvedEntry);
    this.emit('stateChanged', { key, value: resolvedEntry.value, source: 'conflict_resolution' });
  }

  /**
   * Calculate state difference for synchronization
   */
  private calculateStateDiff(remoteKeys: string[], remoteVersion: number): StateEntry[] {
    const diff: StateEntry[] = [];

    // Find entries that are newer or missing on remote
    for (const [key, entry] of this.stateStore) {
      if (!remoteKeys.includes(key) || entry.version > remoteVersion) {
        // eslint-disable-next-line functional/immutable-data
        diff.push(entry);
      }
    }

    return diff;
  }

  /**
   * Merge remote state with local state
   */
  private async mergeRemoteState(remoteEntry: StateEntry): Promise<void> {
    const localEntry = this.stateStore.get(remoteEntry.key);

    if (!localEntry) {
      // New entry, just add it
      // eslint-disable-next-line functional/immutable-data
      this.stateStore.set(remoteEntry.key, remoteEntry);
      this.emit('stateChanged', {
        key: remoteEntry.key,
        value: remoteEntry.value,
        source: 'remote',
      });
      return;
    }

    // Check for conflicts
    if (
      localEntry.version !== remoteEntry.version ||
      localEntry.checksum !== remoteEntry.checksum
    ) {
      const resolved = await this.resolveConflict(localEntry, remoteEntry);
      // eslint-disable-next-line functional/immutable-data
      this.stateStore.set(remoteEntry.key, resolved);
      this.emit('stateChanged', {
        key: remoteEntry.key,
        value: resolved.value,
        source: 'conflict_resolved',
      });
    }
  }

  /**
   * Apply remote operation
   */
  private async applyRemoteOperation(operation: StateOperation): Promise<void> {
    // Apply operation based on type
    switch (operation.type) {
      case 'SET':
        await this.handleRemoteSet(operation);
        break;
      case 'DELETE':
        await this.handleRemoteDelete(operation);
        break;
      case 'INCREMENT':
      case 'DECREMENT':
        await this.handleRemoteIncrement(operation);
        break;
      // Add other operation types as needed
    }
  }

  /**
   * Handle remote SET operation
   */
  private async handleRemoteSet(operation: StateOperation): Promise<void> {
    const entry: StateEntry = {
      key: operation.key,
      value: operation.value,
      version: operation.expectedVersion || 1,
      timestamp: operation.timestamp,
      nodeId: operation.nodeId,
      checksum: this.calculateChecksum(operation.value),
      metadata: {},
    };

    await this.mergeRemoteState(entry);
  }

  /**
   * Handle remote DELETE operation
   */
  private async handleRemoteDelete(operation: StateOperation): Promise<void> {
    const localEntry = this.stateStore.get(operation.key);

    if (localEntry && operation.timestamp > localEntry.timestamp) {
      // eslint-disable-next-line functional/immutable-data
      this.stateStore.delete(operation.key);
      this.emit('stateChanged', { key: operation.key, value: undefined, source: 'remote_delete' });
    }
  }

  /**
   * Handle remote INCREMENT/DECREMENT operation
   */
  private async handleRemoteIncrement(operation: StateOperation): Promise<void> {
    const localEntry = this.stateStore.get(operation.key);

    if (localEntry && typeof localEntry.value === 'number') {
      const delta = operation.type === 'INCREMENT' ? operation.delta || 1 : -(operation.delta || 1);
      const newValue = localEntry.value + delta;

      const updatedEntry: StateEntry = {
        ...localEntry,
        value: newValue,
        version: localEntry.version + 1,
        timestamp: Math.max(localEntry.timestamp, operation.timestamp),
        checksum: this.calculateChecksum(newValue),
      };

      // eslint-disable-next-line functional/immutable-data
      this.stateStore.set(operation.key, updatedEntry);
      this.emit('stateChanged', {
        key: operation.key,
        value: newValue,
        source: 'remote_increment',
      });
    }
  }

  /**
   * Resolve conflict between local and remote state
   */
  private async resolveConflict(local: StateEntry, remote: StateEntry): Promise<StateEntry> {
    // eslint-disable-next-line functional/no-let
    let resolver: ConflictResolver;

    switch (this.config.conflictResolution) {
      case 'last_write_wins':
        resolver = new LastWriteWinsResolver();
        break;
      case 'highest_version':
        resolver = new HighestVersionResolver();
        break;
      case 'merge':
        resolver = new MergeResolver();
        break;
      case 'first_write_wins':
        return local; // Always keep local
      default:
        resolver = new LastWriteWinsResolver();
    }

    const resolved = resolver.resolve(local, remote);

    console.log(
      colors.yellow(
        `⚡ Resolved conflict for key ${local.key} using ${this.config.conflictResolution}`,
      ),
    );

    return resolved;
  }

  /**
   * Get current state version (simplified)
   */
  private getStateVersion(): number {
    // eslint-disable-next-line functional/no-let
    let maxVersion = 0;
    for (const entry of this.stateStore.values()) {
      maxVersion = Math.max(maxVersion, entry.version);
    }
    return maxVersion;
  }

  /**
   * Calculate checksum for value
   */
  private calculateChecksum(value: any): string {
    const serialized = JSON.stringify(value);
    return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${this.config.nodeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Distributed State Manager
 */
export class DistributedStateManager extends EventEmitter {
  private stateStore = new Map<string, StateEntry>();
  private nodes = new Map<string, NodeInfo>();
  private synchronizer: StateSynchronizer;
  private ttlTimer: NodeJS.Timeout | null = null;
  private metrics = {
    totalOperations: 0,
    conflictsResolved: 0,
    syncOperations: 0,
    lastSyncTime: 0,
  };

  constructor(private config: DistributedStateConfig) {
    super();

    this.synchronizer = new StateSynchronizer(config, this.stateStore, this.nodes);

    // Forward synchronizer events
    this.synchronizer.on('syncMessage', (message) => this.emit('syncMessage', message));
    this.synchronizer.on('stateChanged', (event) => this.emit('stateChanged', event));

    console.log(colors.blue(`🗄️ Distributed State Manager initialized (node: ${config.nodeId})`));
  }

  /**
   * Start distributed state management
   */
  start(): void {
    this.synchronizer.start();

    if (this.config.enableTTL) {
      this.startTTLCleanup();
    }

    console.log(colors.green('🚀 Distributed State Manager started'));
  }

  /**
   * Stop distributed state management
   */
  stop(): void {
    this.synchronizer.stop();

    if (this.ttlTimer) {
      clearInterval(this.ttlTimer);
      // eslint-disable-next-line functional/immutable-data
      this.ttlTimer = null;
    }

    console.log(colors.yellow('🛑 Distributed State Manager stopped'));
  }

  /**
   * Set state value
   */
  async set<T>(
    key: string,
    value: T,
    options: {
      ttl?: number;
      expectedVersion?: number;
      metadata?: Record<string, any>;
    } = {},
  ): Promise<void> {
    const existingEntry = this.stateStore.get(key);

    // Check expected version for optimistic locking
    if (options.expectedVersion !== undefined && existingEntry) {
      if (existingEntry.version !== options.expectedVersion) {
        throw new Error(
          `Version mismatch for key ${key}. Expected ${options.expectedVersion}, got ${existingEntry.version}`,
        );
      }
    }

    const entry: StateEntry<T> = {
      key,
      value,
      version: existingEntry ? existingEntry.version + 1 : 1,
      timestamp: Date.now(),
      nodeId: this.config.nodeId,
      checksum: this.calculateChecksum(value),
      metadata: options.metadata || {},
      ttl: options.ttl,
    };

    // eslint-disable-next-line functional/immutable-data
    this.stateStore.set(key, entry);
    // eslint-disable-next-line functional/immutable-data
    this.metrics.totalOperations++;

    // Broadcast state update to other nodes
    await this.broadcastStateUpdate({
      type: 'SET',
      key,
      value,
      expectedVersion: entry.version,
      nodeId: this.config.nodeId,
      timestamp: entry.timestamp,
    });

    this.emit('stateChanged', { key, value, source: 'local' });

    console.log(colors.cyan(`📝 Set state: ${key} = ${JSON.stringify(value).substring(0, 100)}`));
  }

  /**
   * Get state value
   */
  get<T>(key: string): T | undefined {
    const entry = this.stateStore.get(key);

    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      // eslint-disable-next-line functional/immutable-data
      this.stateStore.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Get state entry with metadata
   */
  getEntry<T>(key: string): StateEntry<T> | undefined {
    const entry = this.stateStore.get(key);

    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      // eslint-disable-next-line functional/immutable-data
      this.stateStore.delete(key);
      return undefined;
    }

    return entry as StateEntry<T>;
  }

  /**
   * Delete state value
   */
  async delete(key: string): Promise<boolean> {
    const existed = this.stateStore.has(key);

    if (existed) {
      // eslint-disable-next-line functional/immutable-data
      this.stateStore.delete(key);
      // eslint-disable-next-line functional/immutable-data
      this.metrics.totalOperations++;

      // Broadcast delete operation
      await this.broadcastStateUpdate({
        type: 'DELETE',
        key,
        nodeId: this.config.nodeId,
        timestamp: Date.now(),
      });

      this.emit('stateChanged', { key, value: undefined, source: 'local_delete' });

      console.log(colors.yellow(`🗑️ Deleted state: ${key}`));
    }

    return existed;
  }

  /**
   * Increment numeric value
   */
  async increment(key: string, delta: number = 1): Promise<number> {
    const entry = this.stateStore.get(key);
    const currentValue = (entry?.value as number) || 0;
    const newValue = currentValue + delta;

    await this.set(key, newValue, {
      expectedVersion: entry?.version,
    });

    return newValue;
  }

  /**
   * Decrement numeric value
   */
  async decrement(key: string, delta: number = 1): Promise<number> {
    return this.increment(key, -delta);
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.stateStore.keys());
  }

  /**
   * Get all entries
   */
  entries(): StateEntry[] {
    return Array.from(this.stateStore.values());
  }

  /**
   * Clear all state
   */
  async clear(): Promise<void> {
    // eslint-disable-next-line functional/immutable-data
    this.stateStore.clear();
    // eslint-disable-next-line functional/immutable-data
    this.metrics.totalOperations++;

    console.log(colors.red('🧹 Cleared all state'));
  }

  /**
   * Add node to cluster
   */
  addNode(node: NodeInfo): void {
    // eslint-disable-next-line functional/immutable-data
    this.nodes.set(node.id, node);
    console.log(colors.green(`➕ Added node: ${node.id} (${node.host}:${node.port})`));
  }

  /**
   * Remove node from cluster
   */
  removeNode(nodeId: string): void {
    // eslint-disable-next-line functional/immutable-data
    this.nodes.delete(nodeId);
    console.log(colors.yellow(`➖ Removed node: ${nodeId}`));
  }

  /**
   * Update node status
   */
  updateNodeStatus(nodeId: string, isOnline: boolean): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      // eslint-disable-next-line functional/immutable-data
      node.isOnline = isOnline;
      // eslint-disable-next-line functional/immutable-data
      node.lastSeen = Date.now();
    }
  }

  /**
   * Handle incoming sync message
   */
  async handleSyncMessage(message: SyncMessage): Promise<void> {
    await this.synchronizer.handleSyncMessage(message);
    // eslint-disable-next-line functional/immutable-data
    this.metrics.syncOperations++;
    // eslint-disable-next-line functional/immutable-data
    this.metrics.lastSyncTime = Date.now();
  }

  /**
   * Broadcast state update to other nodes
   */
  private async broadcastStateUpdate(operation: StateOperation): Promise<void> {
    const message: SyncMessage = {
      type: 'STATE_UPDATE',
      fromNode: this.config.nodeId,
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
      data: { operation },
    };

    this.emit('syncMessage', message);
  }

  /**
   * Start TTL cleanup
   */
  private startTTLCleanup(): void {
    // eslint-disable-next-line functional/immutable-data
    this.ttlTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Check every minute
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.stateStore) {
      if (entry.ttl && now - entry.timestamp > entry.ttl) {
        // eslint-disable-next-line functional/immutable-data
        toDelete.push(key);
      }
    }

    toDelete.forEach((key) => {
      // eslint-disable-next-line functional/immutable-data
      this.stateStore.delete(key);
      this.emit('stateChanged', { key, value: undefined, source: 'ttl_expired' });
    });

    if (toDelete.length > 0) {
      console.log(colors.blue(`🧹 Cleaned up ${toDelete.length} expired entries`));
    }
  }

  /**
   * Calculate checksum for value
   */
  private calculateChecksum(value: any): string {
    const serialized = JSON.stringify(value);
    return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${this.config.nodeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get cluster status
   */
  getClusterStatus(): {
    nodeId: string;
    totalNodes: number;
    onlineNodes: number;
    stateEntries: number;
    lastSyncTime: number;
    metrics: {
      totalOperations: number;
      conflictsResolved: number;
      syncOperations: number;
      lastSyncTime: number;
    };
  } {
    const onlineNodes = Array.from(this.nodes.values()).filter((node) => node.isOnline).length;

    return {
      nodeId: this.config.nodeId,
      totalNodes: this.nodes.size,
      onlineNodes,
      stateEntries: this.stateStore.size,
      lastSyncTime: this.metrics.lastSyncTime,
      metrics: { ...this.metrics },
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DistributedStateConfig>): void {
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...config };
    console.log(colors.blue('⚙️ Distributed state configuration updated'));
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down Distributed State Manager...'));
    this.stop();
    // eslint-disable-next-line functional/immutable-data
    this.stateStore.clear();
    // eslint-disable-next-line functional/immutable-data
    this.nodes.clear();
    this.removeAllListeners();
  }
}

/**
 * Default distributed state configuration
 */
export const DEFAULT_DISTRIBUTED_STATE_CONFIG: DistributedStateConfig = {
  nodeId: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  consistencyLevel: 'eventual',
  conflictResolution: 'last_write_wins',
  syncInterval: 30000, // 30 seconds
  maxSyncRetries: 3,
  syncTimeout: 10000, // 10 seconds
  enableCompression: false,
  enableEncryption: false,
  maxStateSize: 10 * 1024 * 1024, // 10MB
  enableMetrics: true,
  replicationFactor: 2,
  enableTTL: true,
  defaultTTL: 3600000, // 1 hour
};

/**
 * Singleton Distributed State Manager instance
 */
// eslint-disable-next-line functional/no-let
let distributedStateInstance: DistributedStateManager | null = null;

/**
 * Get or create the global Distributed State Manager instance
 */
export function getDistributedStateManager(
  config?: DistributedStateConfig,
): DistributedStateManager {
  if (!distributedStateInstance) {
    distributedStateInstance = new DistributedStateManager(
      config || DEFAULT_DISTRIBUTED_STATE_CONFIG,
    );
  }
  return distributedStateInstance;
}

/**
 * Reset the global Distributed State Manager instance (for testing)
 */
export function resetDistributedStateManager(): void {
  if (distributedStateInstance) {
    distributedStateInstance.shutdown();
  }
  distributedStateInstance = null;
}
