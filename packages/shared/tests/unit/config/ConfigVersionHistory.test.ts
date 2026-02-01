/**
 * Configuration Version History Unit Tests
 * 
 * Tests the configuration version history functionality including
 * version tracking, rollback capabilities, and audit trail.
 */

import { ConfigVersionHistory } from '../../../src/config/ConfigVersionHistory';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('ConfigVersionHistory Unit Tests', () => {
  let versionHistory: ConfigVersionHistory;
  let testHistoryDir: string;

  beforeEach(() => {
    testHistoryDir = join(__dirname, 'test-history');
    
    // Clean up any existing test directory
    if (existsSync(testHistoryDir)) {
      rmSync(testHistoryDir, { recursive: true, force: true });
    }
    
    // Create fresh test directory
    mkdirSync(testHistoryDir, { recursive: true });
    
    versionHistory = new ConfigVersionHistory(testHistoryDir, 10, false);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testHistoryDir)) {
      rmSync(testHistoryDir, { recursive: true, force: true });
    }
  });

  describe('Version Saving', () => {
    it('should save configuration version', () => {
      const config = {
        maxLeverage: 20,
        maxDrawdown: 0.07,
        enabled: true
      };

      const version = versionHistory.saveVersion(
        'phase',
        'phase1',
        config,
        'test-user',
        'Initial configuration'
      );

      expect(version.version).toBe(1);
      expect(version.configType).toBe('phase');
      expect(version.configKey).toBe('phase1');
      expect(version.data).toEqual(config);
      expect(version.author).toBe('test-user');
      expect(version.comment).toBe('Initial configuration');
      expect(version.hash).toBeDefined();
      expect(version.timestamp).toBeDefined();
    });

    it('should increment version numbers', () => {
      const config1 = { value: 1 };
      const config2 = { value: 2 };

      const version1 = versionHistory.saveVersion('brain', 'brain', config1);
      const version2 = versionHistory.saveVersion('brain', 'brain', config2);

      expect(version1.version).toBe(1);
      expect(version2.version).toBe(2);
    });

    it('should skip duplicate configurations', () => {
      const config = { value: 1 };

      const version1 = versionHistory.saveVersion('brain', 'brain', config);
      const version2 = versionHistory.saveVersion('brain', 'brain', config);

      expect(version1.version).toBe(1);
      expect(version2.version).toBe(1); // Same version returned
      expect(version1.hash).toBe(version2.hash);
    });
  });

  describe('Version Retrieval', () => {
    beforeEach(() => {
      // Set up test data
      versionHistory.saveVersion('phase', 'phase1', { value: 1 }, 'user1', 'Version 1');
      versionHistory.saveVersion('phase', 'phase1', { value: 2 }, 'user2', 'Version 2');
      versionHistory.saveVersion('phase', 'phase1', { value: 3 }, 'user1', 'Version 3');
    });

    it('should get specific version', () => {
      const version = versionHistory.getVersion('phase', 'phase1', 2);
      
      expect(version).toBeDefined();
      expect(version!.version).toBe(2);
      expect(version!.data.value).toBe(2);
      expect(version!.author).toBe('user2');
    });

    it('should get latest version', () => {
      const version = versionHistory.getLatestVersion('phase', 'phase1');
      
      expect(version).toBeDefined();
      expect(version!.version).toBe(3);
      expect(version!.data.value).toBe(3);
    });

    it('should get all versions', () => {
      const versions = versionHistory.getAllVersions('phase', 'phase1');
      
      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe(1);
      expect(versions[1].version).toBe(2);
      expect(versions[2].version).toBe(3);
    });

    it('should get version metadata', () => {
      const metadata = versionHistory.getMetadata('phase', 'phase1');
      
      expect(metadata).toBeDefined();
      expect(metadata!.configType).toBe('phase');
      expect(metadata!.configKey).toBe('phase1');
      expect(metadata!.currentVersion).toBe(3);
      expect(metadata!.totalVersions).toBe(3);
      expect(metadata!.firstVersion).toBe(1);
    });
  });

  describe('Version Rollback', () => {
    beforeEach(() => {
      // Set up test data
      versionHistory.saveVersion('brain', 'brain', { value: 1 }, 'user1', 'Version 1');
      versionHistory.saveVersion('brain', 'brain', { value: 2 }, 'user2', 'Version 2');
      versionHistory.saveVersion('brain', 'brain', { value: 3 }, 'user1', 'Version 3');
    });

    it('should rollback to previous version', () => {
      const result = versionHistory.rollbackToVersion('brain', 'brain', 2);
      
      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(3);
      expect(result.toVersion).toBe(4); // New version created for rollback
      expect(result.data.value).toBe(2); // Data from version 2
    });

    it('should handle rollback to non-existent version', () => {
      const result = versionHistory.rollbackToVersion('brain', 'brain', 99);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Version 99 not found');
    });
  });

  describe('Version Comparison', () => {
    beforeEach(() => {
      // Set up test data
      versionHistory.saveVersion('phase', 'phase1', { 
        maxLeverage: 20, 
        maxDrawdown: 0.07,
        enabled: true 
      }, 'user1', 'Version 1');
      
      versionHistory.saveVersion('phase', 'phase1', { 
        maxLeverage: 15, 
        maxDrawdown: 0.05,
        enabled: true,
        newField: 'added'
      }, 'user2', 'Version 2');
    });

    it('should compare two versions', () => {
      const comparison = versionHistory.compareVersions('phase', 'phase1', 1, 2);
      
      expect(comparison).toBeDefined();
      expect(comparison!.fromVersion).toBe(1);
      expect(comparison!.toVersion).toBe(2);
      expect(comparison!.changes).toHaveLength(3); // 2 modified + 1 added
      expect(comparison!.summary.modified).toBe(2);
      expect(comparison!.summary.added).toBe(1);
      expect(comparison!.summary.removed).toBe(0);
    });
  });

  describe('Version Search', () => {
    beforeEach(() => {
      // Set up test data with different authors and tags
      versionHistory.saveVersion('brain', 'brain', { value: 1 }, 'alice', 'Initial setup', ['setup']);
      versionHistory.saveVersion('brain', 'brain', { value: 2 }, 'bob', 'Bug fix', ['bugfix']);
      versionHistory.saveVersion('brain', 'brain', { value: 3 }, 'alice', 'Feature update', ['feature']);
    });

    it('should search by author', () => {
      const versions = versionHistory.searchVersions('brain', 'brain', { author: 'alice' });
      
      expect(versions).toHaveLength(2);
      expect(versions[0].author).toBe('alice');
      expect(versions[1].author).toBe('alice');
    });

    it('should search by tags', () => {
      const versions = versionHistory.searchVersions('brain', 'brain', { tags: ['bugfix'] });
      
      expect(versions).toHaveLength(1);
      expect(versions[0].tags).toContain('bugfix');
    });

    it('should search by comment', () => {
      const versions = versionHistory.searchVersions('brain', 'brain', { comment: 'Bug' });
      
      expect(versions).toHaveLength(1);
      expect(versions[0].comment).toContain('Bug fix');
    });
  });

  describe('History Management', () => {
    it('should prune old versions', () => {
      // Create more versions than the limit
      for (let i = 1; i <= 15; i++) {
        versionHistory.saveVersion('service', 'test', { value: i });
      }
      
      const beforePrune = versionHistory.getAllVersions('service', 'test');
      expect(beforePrune).toHaveLength(10); // Limited by maxVersions
      
      const pruned = versionHistory.pruneHistory('service', 'test', 5);
      expect(pruned).toBe(5); // 5 versions removed
      
      const afterPrune = versionHistory.getAllVersions('service', 'test');
      expect(afterPrune).toHaveLength(5);
    });

    it('should clear history', () => {
      versionHistory.saveVersion('brain', 'brain', { value: 1 });
      versionHistory.saveVersion('brain', 'brain', { value: 2 });
      
      expect(versionHistory.getAllVersions('brain', 'brain')).toHaveLength(2);
      
      versionHistory.clearHistory('brain', 'brain');
      
      expect(versionHistory.getAllVersions('brain', 'brain')).toHaveLength(0);
    });
  });
});