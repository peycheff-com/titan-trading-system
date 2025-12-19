/**
 * Distributed State Manager for Titan Trading System
 *
 * Provides distributed state management and synchronization across
 * multiple service instances with conflict resolution and consistency guarantees.
 *
 * Requirements: 10.1 - Distributed state management and synchronization
 */
import { EventEmitter } from 'eventemitter3';
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
    ttl?: number;
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
export type ConflictResolutionStrategy = 'last_write_wins' | 'first_write_wins' | 'highest_version' | 'custom' | 'merge';
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
    syncInterval: number;
    maxSyncRetries: number;
    syncTimeout: number;
    enableCompression: boolean;
    enableEncryption: boolean;
    maxStateSize: number;
    enableMetrics: boolean;
    replicationFactor: number;
    enableTTL: boolean;
    defaultTTL: number;
}
/**
 * Sync message types
 */
export interface SyncMessage {
    type: 'SYNC_REQUEST' | 'SYNC_RESPONSE' | 'STATE_UPDATE' | 'CONFLICT_RESOLUTION';
    fromNode: string;
    toNode?: string;
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
export declare class LastWriteWinsResolver<T> implements ConflictResolver<T> {
    resolve(local: StateEntry<T>, remote: StateEntry<T>): StateEntry<T>;
}
export declare class HighestVersionResolver<T> implements ConflictResolver<T> {
    resolve(local: StateEntry<T>, remote: StateEntry<T>): StateEntry<T>;
}
export declare class MergeResolver<T> implements ConflictResolver<T> {
    resolve(local: StateEntry<T>, remote: StateEntry<T>): StateEntry<T>;
}
/**
 * Distributed State Manager
 */
export declare class DistributedStateManager extends EventEmitter {
    private config;
    private stateStore;
    private nodes;
    private synchronizer;
    private ttlTimer;
    private metrics;
    constructor(config: DistributedStateConfig);
    /**
     * Start distributed state management
     */
    start(): void;
    /**
     * Stop distributed state management
     */
    stop(): void;
    /**
     * Set state value
     */
    set<T>(key: string, value: T, options?: {
        ttl?: number;
        expectedVersion?: number;
        metadata?: Record<string, any>;
    }): Promise<void>;
    /**
     * Get state value
     */
    get<T>(key: string): T | undefined;
    /**
     * Get state entry with metadata
     */
    getEntry<T>(key: string): StateEntry<T> | undefined;
    /**
     * Delete state value
     */
    delete(key: string): Promise<boolean>;
    /**
     * Increment numeric value
     */
    increment(key: string, delta?: number): Promise<number>;
    /**
     * Decrement numeric value
     */
    decrement(key: string, delta?: number): Promise<number>;
    /**
     * Get all keys
     */
    keys(): string[];
    /**
     * Get all entries
     */
    entries(): StateEntry[];
    /**
     * Clear all state
     */
    clear(): Promise<void>;
    /**
     * Add node to cluster
     */
    addNode(node: NodeInfo): void;
    /**
     * Remove node from cluster
     */
    removeNode(nodeId: string): void;
    /**
     * Update node status
     */
    updateNodeStatus(nodeId: string, isOnline: boolean): void;
    /**
     * Handle incoming sync message
     */
    handleSyncMessage(message: SyncMessage): Promise<void>;
    /**
     * Broadcast state update to other nodes
     */
    private broadcastStateUpdate;
    /**
     * Start TTL cleanup
     */
    private startTTLCleanup;
    /**
     * Clean up expired entries
     */
    private cleanupExpiredEntries;
    /**
     * Calculate checksum for value
     */
    private calculateChecksum;
    /**
     * Generate unique message ID
     */
    private generateMessageId;
    /**
     * Get cluster status
     */
    getClusterStatus(): {
        nodeId: string;
        totalNodes: number;
        onlineNodes: number;
        stateEntries: number;
        lastSyncTime: number;
        metrics: typeof this.metrics;
    };
    /**
     * Update configuration
     */
    updateConfig(config: Partial<DistributedStateConfig>): void;
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
/**
 * Default distributed state configuration
 */
export declare const DEFAULT_DISTRIBUTED_STATE_CONFIG: DistributedStateConfig;
/**
 * Get or create the global Distributed State Manager instance
 */
export declare function getDistributedStateManager(config?: DistributedStateConfig): DistributedStateManager;
/**
 * Reset the global Distributed State Manager instance (for testing)
 */
export declare function resetDistributedStateManager(): void;
//# sourceMappingURL=DistributedStateManager.d.ts.map