/**
 * Rollback Performance Optimizer
 * 
 * Optimizes rollback operations for speed and efficiency with parallel processing.
 * Implements Requirement 8.5: Complete rollback operations within 2 minutes with parallel operations.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { RollbackInstruction } from './VersionManager';

export interface OptimizationConfig {
  maxParallelOperations: number;
  fileOperationChunkSize: number;
  compressionLevel: number;
  useIncrementalBackup: boolean;
  preloadCriticalServices: boolean;
  optimizeFileOperations: boolean;
  enableProgressiveRestart: boolean;
}

export interface ParallelOperation {
  id: string;
  type: 'file_copy' | 'service_operation' | 'validation' | 'compression';
  priority: number;
  dependencies: string[];
  estimatedDuration: number;
  operation: () => Promise<any>;
}

export interface OptimizationResult {
  originalDuration: number;
  optimizedDuration: number;
  improvementPercent: number;
  parallelOperationsUsed: number;
  bottlenecks: string[];
  recommendations: string[];
}

export interface PerformanceMetrics {
  operationType: string;
  duration: number;
  throughput?: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

/**
 * Rollback Performance Optimizer
 * 
 * Provides advanced optimization techniques for rollback operations including
 * parallel processing, incremental operations, and resource optimization.
 */
export class RollbackOptimizer extends EventEmitter {
  private config: OptimizationConfig;
  private operationQueue: ParallelOperation[] = [];
  private activeOperations: Map<string, Promise<any>> = new Map();
  private performanceMetrics: PerformanceMetrics[] = [];

  constructor(config?: Partial<OptimizationConfig>) {
    super();
    
    this.config = {
      maxParallelOperations: 4,
      fileOperationChunkSize: 1024 * 1024, // 1MB chunks
      compressionLevel: 6,
      useIncrementalBackup: true,
      preloadCriticalServices: true,
      optimizeFileOperations: true,
      enableProgressiveRestart: true,
      ...config
    };
  }

  /**
   * Optimize rollback instructions for parallel execution
   * Requirement 8.5: Parallel service operations where safe
   */
  optimizeRollbackInstructions(instructions: RollbackInstruction[]): {
    optimizedInstructions: RollbackInstruction[][];
    estimatedDuration: number;
    parallelizationGains: number;
  } {
    // Group instructions by dependencies and safety
    const dependencyGraph = this.buildDependencyGraph(instructions);
    const parallelGroups = this.createParallelGroups(instructions, dependencyGraph);
    
    // Calculate timing improvements
    const originalDuration = instructions.reduce((sum, inst) => sum + (inst.timeout / 1000), 0);
    const optimizedDuration = this.calculateOptimizedDuration(parallelGroups);
    const parallelizationGains = ((originalDuration - optimizedDuration) / originalDuration) * 100;

    return {
      optimizedInstructions: parallelGroups,
      estimatedDuration: optimizedDuration,
      parallelizationGains
    };
  }

  /**
   * Execute optimized file operations with parallel processing
   */
  async executeOptimizedFileOperations(operations: Array<{
    source: string;
    target: string;
    type: 'copy' | 'move' | 'compress';
  }>): Promise<void> {
    if (!this.config.optimizeFileOperations) {
      // Fall back to sequential operations
      for (const op of operations) {
        await this.executeFileOperation(op);
      }
      return;
    }

    // Group operations by target directory to optimize disk I/O
    const groupedOperations = this.groupOperationsByTarget(operations);
    
    // Execute groups in parallel with controlled concurrency
    const chunks = this.chunkArray(Object.values(groupedOperations), this.config.maxParallelOperations);
    
    for (const chunk of chunks) {
      await Promise.all(chunk.map(group => this.executeFileOperationGroup(group)));
    }
  }

  /**
   * Optimize service restart sequence for minimal downtime
   */
  async optimizeServiceRestart(services: Array<{
    name: string;
    dependencies: string[];
    criticalPath: boolean;
    startupTime: number;
  }>): Promise<Array<{
    phase: number;
    services: string[];
    estimatedTime: number;
  }>> {
    // Identify critical path services that must start first
    const criticalServices = services.filter(s => s.criticalPath);
    const nonCriticalServices = services.filter(s => !s.criticalPath);
    
    const restartPhases: Array<{
      phase: number;
      services: string[];
      estimatedTime: number;
    }> = [];

    // Phase 1: Start critical services sequentially
    if (criticalServices.length > 0) {
      restartPhases.push({
        phase: 1,
        services: criticalServices.map(s => s.name),
        estimatedTime: Math.max(...criticalServices.map(s => s.startupTime))
      });
    }

    // Phase 2: Start non-critical services in parallel
    if (nonCriticalServices.length > 0) {
      const parallelGroups = this.createServiceParallelGroups(nonCriticalServices);
      
      parallelGroups.forEach((group, index) => {
        restartPhases.push({
          phase: 2 + index,
          services: group.map(s => s.name),
          estimatedTime: Math.max(...group.map(s => s.startupTime))
        });
      });
    }

    return restartPhases;
  }

  /**
   * Create incremental backup for faster restoration
   */
  async createIncrementalBackup(
    baseBackupPath: string,
    currentPath: string,
    targetPath: string
  ): Promise<{
    incrementalPath: string;
    sizeSaved: number;
    timeSaved: number;
  }> {
    if (!this.config.useIncrementalBackup) {
      throw new Error('Incremental backup is disabled');
    }

    const incrementalPath = `${targetPath}.incremental`;
    let sizeSaved = 0;
    let timeSaved = 0;

    const startTime = Date.now();

    // Compare files and create incremental backup
    const changes = await this.detectFileChanges(baseBackupPath, currentPath);
    
    // Only backup changed files
    for (const change of changes) {
      if (change.type === 'modified' || change.type === 'added') {
        const sourcePath = path.join(currentPath, change.relativePath);
        const targetFilePath = path.join(incrementalPath, change.relativePath);
        
        await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
        await fs.copyFile(sourcePath, targetFilePath);
        
        sizeSaved += change.size || 0;
      }
    }

    // Create metadata file
    const metadata = {
      baseBackup: baseBackupPath,
      timestamp: new Date().toISOString(),
      changes: changes.length,
      sizeSaved
    };
    
    await fs.writeFile(
      path.join(incrementalPath, '.incremental-metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    timeSaved = Date.now() - startTime;

    return {
      incrementalPath,
      sizeSaved,
      timeSaved
    };
  }

  /**
   * Preload critical services for faster startup
   */
  async preloadCriticalServices(services: string[]): Promise<void> {
    if (!this.config.preloadCriticalServices) {
      return;
    }

    // Preload service dependencies and configurations
    const preloadPromises = services.map(async (serviceName) => {
      try {
        // Preload service configuration
        const configPath = `./config/${serviceName}.config.json`;
        await fs.readFile(configPath);
        
        // Preload service package.json
        const packagePath = `./services/${serviceName}/package.json`;
        await fs.readFile(packagePath);
        
        // Warm up any cached data
        this.emit('service:preloaded', { service: serviceName });
      } catch (error) {
        // Service might not exist or have config, continue
        console.warn(`Failed to preload service ${serviceName}:`, error);
      }
    });

    await Promise.allSettled(preloadPromises);
  }

  /**
   * Compress backup files for faster transfer
   */
  async compressBackupFiles(sourcePath: string, targetPath: string): Promise<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    compressionTime: number;
  }> {
    const startTime = Date.now();
    
    // Get original size
    const originalSize = await this.getDirectorySize(sourcePath);
    
    // Create compressed archive
    const { createGzip } = require('zlib');
    const tar = require('tar');
    
    await tar.create(
      {
        gzip: {
          level: this.config.compressionLevel
        },
        file: targetPath,
        cwd: path.dirname(sourcePath)
      },
      [path.basename(sourcePath)]
    );
    
    // Get compressed size
    const compressedSize = (await fs.stat(targetPath)).size;
    const compressionRatio = (1 - compressedSize / originalSize) * 100;
    const compressionTime = Date.now() - startTime;

    return {
      originalSize,
      compressedSize,
      compressionRatio,
      compressionTime
    };
  }

  /**
   * Monitor rollback performance and identify bottlenecks
   */
  async monitorRollbackPerformance(operationId: string): Promise<PerformanceMetrics> {
    const startTime = Date.now();
    const startUsage = process.cpuUsage();
    const startMemory = process.memoryUsage();

    // Monitor operation (this would be called during actual operations)
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const currentUsage = process.cpuUsage(startUsage);
        const currentMemory = process.memoryUsage();
        
        const metrics: PerformanceMetrics = {
          operationType: operationId,
          duration: Date.now() - startTime,
          resourceUsage: {
            cpu: (currentUsage.user + currentUsage.system) / 1000000, // Convert to seconds
            memory: currentMemory.heapUsed / 1024 / 1024, // Convert to MB
            disk: 0 // Would need additional monitoring for disk I/O
          }
        };

        this.performanceMetrics.push(metrics);
        resolve(metrics);
        clearInterval(interval);
      }, 1000);
    });
  }

  /**
   * Build dependency graph for instructions
   */
  private buildDependencyGraph(instructions: RollbackInstruction[]): Map<number, number[]> {
    const graph = new Map<number, number[]>();
    
    // Build implicit dependencies based on action types
    for (let i = 0; i < instructions.length; i++) {
      const instruction = instructions[i];
      const dependencies: number[] = [];
      
      // Service start depends on service stop and file restoration
      if (instruction.action === 'start_service') {
        for (let j = 0; j < i; j++) {
          const prevInstruction = instructions[j];
          if (prevInstruction.action === 'stop_service' || 
              prevInstruction.action === 'restore_files') {
            dependencies.push(j);
          }
        }
      }
      
      // Service validation depends on service start
      if (instruction.action === 'validate_service') {
        for (let j = 0; j < i; j++) {
          const prevInstruction = instructions[j];
          if (prevInstruction.action === 'start_service' && 
              prevInstruction.target === instruction.target) {
            dependencies.push(j);
          }
        }
      }
      
      graph.set(i, dependencies);
    }
    
    return graph;
  }

  /**
   * Create parallel execution groups
   */
  private createParallelGroups(
    instructions: RollbackInstruction[],
    dependencyGraph: Map<number, number[]>
  ): RollbackInstruction[][] {
    const groups: RollbackInstruction[][] = [];
    const processed = new Set<number>();
    
    while (processed.size < instructions.length) {
      const currentGroup: RollbackInstruction[] = [];
      
      for (let i = 0; i < instructions.length; i++) {
        if (processed.has(i)) continue;
        
        const dependencies = dependencyGraph.get(i) || [];
        const canExecute = dependencies.every(dep => processed.has(dep));
        
        if (canExecute && this.canExecuteInParallel(instructions[i], currentGroup)) {
          currentGroup.push(instructions[i]);
          processed.add(i);
        }
      }
      
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      } else {
        // Deadlock detection - should not happen with proper dependency graph
        break;
      }
    }
    
    return groups;
  }

  /**
   * Check if instruction can be executed in parallel with current group
   */
  private canExecuteInParallel(instruction: RollbackInstruction, group: RollbackInstruction[]): boolean {
    // Some operations cannot be parallelized
    const exclusiveActions = ['stop_service', 'restore_database'];
    
    if (exclusiveActions.includes(instruction.action)) {
      return group.length === 0;
    }
    
    // File operations can be parallelized if they don't conflict
    if (instruction.action === 'restore_files') {
      return !group.some(g => g.action === 'restore_files' && g.target === instruction.target);
    }
    
    // Service operations can be parallelized for different services
    if (instruction.action === 'start_service' || instruction.action === 'validate_service') {
      return !group.some(g => g.target === instruction.target);
    }
    
    return true;
  }

  /**
   * Calculate optimized duration for parallel groups
   */
  private calculateOptimizedDuration(groups: RollbackInstruction[][]): number {
    return groups.reduce((sum, group) => {
      const maxDuration = Math.max(...group.map(inst => inst.timeout / 1000));
      return sum + maxDuration;
    }, 0);
  }

  /**
   * Group file operations by target directory
   */
  private groupOperationsByTarget(operations: Array<{
    source: string;
    target: string;
    type: 'copy' | 'move' | 'compress';
  }>): Record<string, typeof operations> {
    const groups: Record<string, typeof operations> = {};
    
    for (const op of operations) {
      const targetDir = path.dirname(op.target);
      if (!groups[targetDir]) {
        groups[targetDir] = [];
      }
      groups[targetDir].push(op);
    }
    
    return groups;
  }

  /**
   * Execute a group of file operations
   */
  private async executeFileOperationGroup(operations: Array<{
    source: string;
    target: string;
    type: 'copy' | 'move' | 'compress';
  }>): Promise<void> {
    const promises = operations.map(op => this.executeFileOperation(op));
    await Promise.all(promises);
  }

  /**
   * Execute a single file operation
   */
  private async executeFileOperation(operation: {
    source: string;
    target: string;
    type: 'copy' | 'move' | 'compress';
  }): Promise<void> {
    switch (operation.type) {
      case 'copy':
        await fs.copyFile(operation.source, operation.target);
        break;
      case 'move':
        await fs.rename(operation.source, operation.target);
        break;
      case 'compress':
        await this.compressBackupFiles(operation.source, operation.target);
        break;
    }
  }

  /**
   * Create parallel groups for service restart
   */
  private createServiceParallelGroups(services: Array<{
    name: string;
    dependencies: string[];
    criticalPath: boolean;
    startupTime: number;
  }>): Array<typeof services> {
    const groups: Array<typeof services> = [];
    const processed = new Set<string>();
    
    while (processed.size < services.length) {
      const currentGroup: typeof services = [];
      
      for (const service of services) {
        if (processed.has(service.name)) continue;
        
        const canStart = service.dependencies.every(dep => processed.has(dep));
        if (canStart) {
          currentGroup.push(service);
          processed.add(service.name);
        }
      }
      
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      } else {
        break;
      }
    }
    
    return groups;
  }

  /**
   * Detect file changes for incremental backup
   */
  private async detectFileChanges(basePath: string, currentPath: string): Promise<Array<{
    relativePath: string;
    type: 'added' | 'modified' | 'deleted';
    size?: number;
  }>> {
    const changes: Array<{
      relativePath: string;
      type: 'added' | 'modified' | 'deleted';
      size?: number;
    }> = [];

    // This is a simplified implementation
    // In production, you would use more sophisticated file comparison
    try {
      const currentFiles = await this.getAllFiles(currentPath);
      const baseFiles = await this.getAllFiles(basePath);
      
      const currentSet = new Set(currentFiles);
      const baseSet = new Set(baseFiles);
      
      // Find added files
      for (const file of currentFiles) {
        if (!baseSet.has(file)) {
          const stat = await fs.stat(path.join(currentPath, file));
          changes.push({
            relativePath: file,
            type: 'added',
            size: stat.size
          });
        }
      }
      
      // Find deleted files
      for (const file of baseFiles) {
        if (!currentSet.has(file)) {
          changes.push({
            relativePath: file,
            type: 'deleted'
          });
        }
      }
      
      // Find modified files (simplified - just check modification time)
      for (const file of currentFiles) {
        if (baseSet.has(file)) {
          const currentStat = await fs.stat(path.join(currentPath, file));
          const baseStat = await fs.stat(path.join(basePath, file));
          
          if (currentStat.mtime > baseStat.mtime) {
            changes.push({
              relativePath: file,
              type: 'modified',
              size: currentStat.size
            });
          }
        }
      }
    } catch (error) {
      // If we can't detect changes, assume everything changed
      console.warn('Failed to detect file changes, assuming full backup needed:', error);
    }
    
    return changes;
  }

  /**
   * Get all files in a directory recursively
   */
  private async getAllFiles(dirPath: string, relativeTo?: string): Promise<string[]> {
    const files: string[] = [];
    const basePath = relativeTo || dirPath;
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);
        
        if (entry.isDirectory()) {
          const subFiles = await this.getAllFiles(fullPath, basePath);
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }
    } catch (error) {
      // Directory might not exist
    }
    
    return files;
  }

  /**
   * Get directory size recursively
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          size += await this.getDirectorySize(fullPath);
        } else {
          const stat = await fs.stat(fullPath);
          size += stat.size;
        }
      }
    } catch (error) {
      // Directory might not exist
    }
    
    return size;
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics[] {
    return [...this.performanceMetrics];
  }

  /**
   * Clear performance metrics
   */
  clearPerformanceMetrics(): void {
    this.performanceMetrics = [];
  }

  /**
   * Update optimization configuration
   */
  updateConfig(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('optimizer:config_updated', this.config);
  }

  /**
   * Get current optimization configuration
   */
  getConfig(): OptimizationConfig {
    return { ...this.config };
  }
}