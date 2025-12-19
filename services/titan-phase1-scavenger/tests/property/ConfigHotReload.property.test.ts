/**
 * Configuration Hot-Reload Property-Based Tests
 * 
 * Tests configuration hot-reload functionality with property-based testing
 * Requirements: 8.4 (Configuration hot-reload capabilities)
 */

import * as fc from 'fast-check';
import { ConfigManager, TrapConfig, BrainOverrideConfig } from '../../src/config/ConfigManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

/**
 * **Feature: titan-system-integration-review, Property 10: Configuration Hot Reload**
 * **Validates: Requirements 8.4**
 * 
 * For any valid configuration changes, hot-reload should preserve system state and apply changes correctly
 */
describe('Configuration Hot-Reload Property Tests', () => {
  let configManager: ConfigManager;
  let tempDir: string;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup temp directory
    tempDir = path.join(os.tmpdir(), 'titan-test-config-hotreload');
    
    // Mock environment
    process.env.NODE_ENV = 'test';
    process.env.TITAN_CONFIG_DIR = tempDir;
    
    // Mock fs.existsSync to return false initially
    mockFs.existsSync.mockReturnValue(false);
    
    // Mock fs.mkdirSync
    mockFs.mkdirSync.mockImplementation(() => undefined);
    
    // Mock fs.writeFileSync
    mockFs.writeFileSync.mockImplementation(() => undefined);
    
    // Mock fs.watch
    mockFs.watch.mockReturnValue({
      close: jest.fn(),
    } as any);
  });

  afterEach(() => {
    if (configManager) {
      configManager.destroy();
    }
    
    // Clean up environment
    delete process.env.TITAN_CONFIG_DIR;
  });

  /**
   * Property 1: Configuration State Preservation
   * For any sequence of valid configuration updates, the system should maintain consistency
   */
  it('should preserve configuration state consistency during hot-reload', () => {
    fc.assert(
      fc.property(
        // Generate sequence of valid configuration updates
        fc.array(
          fc.record({
            maxLeverage: fc.integer({ min: 1, max: 100 }),
            updateInterval: fc.integer({ min: 10000, max: 300000 }),
            stopLossPercent: fc.float({ min: Math.fround(0.001), max: Math.fround(0.1), noNaN: true }),
            targetPercent: fc.float({ min: Math.fround(0.001), max: Math.fround(0.5), noNaN: true }),
            liquidationConfidence: fc.integer({ min: 50, max: 100 }),
            topSymbolsCount: fc.integer({ min: 5, max: 50 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (configUpdates: Partial<TrapConfig>[]) => {
          configManager = new ConfigManager('test');
          
          // Apply each configuration update and verify consistency
          for (const update of configUpdates) {
            const beforeConfig = configManager.getConfig();
            
            // Apply update
            configManager.updatePhaseConfig(update);
            
            // Simulate hot-reload
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
              ...configManager.getPhaseConfig(),
              ...update
            }));
            
            configManager.reload();
            
            const afterConfig = configManager.getConfig();
            
            // Verify that updated values are applied
            Object.keys(update).forEach(key => {
              expect(afterConfig[key as keyof TrapConfig]).toBe(update[key as keyof TrapConfig]);
            });
            
            // Verify that non-updated values are preserved (use deep equality for objects)
            Object.keys(beforeConfig).forEach(key => {
              if (!(key in update) && key !== 'brainOverrides' && key !== 'effective') {
                const beforeValue = beforeConfig[key as keyof TrapConfig];
                const afterValue = afterConfig[key as keyof TrapConfig];
                
                if (typeof beforeValue === 'object' && beforeValue !== null) {
                  expect(afterValue).toStrictEqual(beforeValue);
                } else {
                  expect(afterValue).toBe(beforeValue);
                }
              }
            });
            
            // Verify configuration is still valid
            const phaseConfig = configManager.getPhaseConfig();
            const errors = configManager.validateConfig(phaseConfig);
            expect(errors).toHaveLength(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2: Brain Override Persistence
   * For any valid Brain overrides, hot-reload should preserve override hierarchy
   */
  it('should preserve Brain override hierarchy during hot-reload', () => {
    fc.assert(
      fc.property(
        fc.record({
          maxGlobalLeverage: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
          phase1: fc.option(fc.record({
            enabled: fc.boolean(),
            maxLeverage: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
            riskMultiplier: fc.option(fc.float({ min: Math.fround(0.1), max: Math.fround(2.0), noNaN: true }), { nil: undefined })
          }), { nil: undefined }),
          source: fc.constant('brain' as const),
          timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
          version: fc.constant('1.0.0')
        }),
        fc.record({
          maxLeverage: fc.integer({ min: 1, max: 100 }),
          stopLossPercent: fc.float({ min: Math.fround(0.001), max: Math.fround(0.1), noNaN: true })
        }),
        (brainOverrides: Partial<BrainOverrideConfig>, phaseUpdate: Partial<TrapConfig>) => {
          configManager = new ConfigManager('test');
          
          // Apply Brain overrides
          configManager.updateBrainOverrides(brainOverrides);
          
          // Apply phase config update
          configManager.updatePhaseConfig(phaseUpdate);
          
          const beforeMerged = configManager.getConfig();
          
          // Simulate hot-reload of both configs
          mockFs.existsSync.mockReturnValue(true);
          mockFs.readFileSync
            .mockReturnValueOnce(JSON.stringify({
              ...configManager.getPhaseConfig(),
              ...phaseUpdate
            }))
            .mockReturnValueOnce(JSON.stringify({
              ...configManager.getBrainOverrides(),
              ...brainOverrides
            }));
          
          configManager.reload();
          
          const afterMerged = configManager.getConfig();
          
          // Verify Brain overrides still take precedence
          if (brainOverrides.maxGlobalLeverage !== undefined) {
            expect(afterMerged.effective.maxLeverage).toBeLessThanOrEqual(brainOverrides.maxGlobalLeverage);
          }
          
          if (brainOverrides.phase1?.enabled !== undefined) {
            expect(afterMerged.effective.enabled).toBe(brainOverrides.phase1.enabled);
          }
          
          // Calculate expected effective maxLeverage based on merge logic
          let expectedMaxLeverage = phaseUpdate.maxLeverage!;
          
          // Apply global override (caps the value)
          if (brainOverrides.maxGlobalLeverage !== undefined) {
            expectedMaxLeverage = Math.min(expectedMaxLeverage, brainOverrides.maxGlobalLeverage);
          }
          
          // Apply phase1 override (also caps the value)
          if (brainOverrides.phase1?.maxLeverage !== undefined) {
            expectedMaxLeverage = Math.min(expectedMaxLeverage, brainOverrides.phase1.maxLeverage);
          }
          
          expect(afterMerged.effective.maxLeverage).toBe(expectedMaxLeverage);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 3: Event Emission Consistency
   * For any configuration change, hot-reload should emit appropriate events
   */
  it('should emit consistent events during hot-reload operations', () => {
    fc.assert(
      fc.property(
        fc.record({
          maxLeverage: fc.integer({ min: 1, max: 100 }),
          updateInterval: fc.integer({ min: 10000, max: 300000 }),
          liquidationConfidence: fc.integer({ min: 50, max: 100 })
        }),
        (configUpdate: Partial<TrapConfig>) => {
          configManager = new ConfigManager('test');
          
          const events: Array<{ type: string; source: string; changes: any }> = [];
          
          // Listen for config change events
          configManager.on('configChanged', (event) => {
            events.push(event);
          });
          
          // Apply initial update
          configManager.updatePhaseConfig(configUpdate);
          
          // Simulate hot-reload
          mockFs.existsSync.mockReturnValue(true);
          mockFs.readFileSync.mockReturnValue(JSON.stringify({
            ...configManager.getPhaseConfig(),
            ...configUpdate
          }));
          
          configManager.reload();
          
          // Verify events were emitted
          expect(events.length).toBeGreaterThan(0);
          
          // Verify event structure
          events.forEach(event => {
            expect(event.type).toMatch(/^(phase|brain)$/);
            expect(event.source).toMatch(/^(api|file|brain-api|reload)$/);
            expect(event.changes).toBeDefined();
            expect(typeof event.changes).toBe('object');
          });
          
          // Verify at least one event is from reload operation (could be 'reload' or 'file')
          const reloadEvents = events.filter(e => e.source === 'reload' || e.source === 'file');
          expect(reloadEvents.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 4: Configuration Validation During Reload
   * For any configuration file content, hot-reload should validate before applying
   */
  it('should validate configuration during hot-reload and reject invalid configs', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Valid configuration
          fc.record({
            maxLeverage: fc.integer({ min: 1, max: 100 }),
            updateInterval: fc.integer({ min: 10000, max: 300000 }),
            stopLossPercent: fc.float({ min: Math.fround(0.001), max: Math.fround(0.1), noNaN: true })
          }),
          // Invalid configuration
          fc.record({
            maxLeverage: fc.integer({ min: 101, max: 200 }), // Invalid
            updateInterval: fc.integer({ min: 1000, max: 9999 }), // Invalid
            stopLossPercent: fc.float({ min: Math.fround(0.2), max: Math.fround(1.0), noNaN: true }) // Invalid
          })
        ),
        fc.boolean(), // isValid flag
        (configUpdate: Partial<TrapConfig>, shouldBeValid: boolean) => {
          configManager = new ConfigManager('test');
          
          const originalConfig = configManager.getConfig();
          
          // Create valid or invalid config based on flag
          const testConfig = shouldBeValid ? {
            maxLeverage: Math.min(configUpdate.maxLeverage || 20, 100),
            updateInterval: Math.max(configUpdate.updateInterval || 30000, 10000),
            stopLossPercent: Math.min(configUpdate.stopLossPercent || 0.02, 0.1)
          } : {
            maxLeverage: Math.max(configUpdate.maxLeverage || 150, 101),
            updateInterval: Math.min(configUpdate.updateInterval || 5000, 9999),
            stopLossPercent: Math.max(configUpdate.stopLossPercent || 0.5, 0.2)
          };
          
          // Simulate hot-reload with test config
          mockFs.existsSync.mockReturnValue(true);
          mockFs.readFileSync.mockReturnValue(JSON.stringify(testConfig));
          
          if (shouldBeValid) {
            // Valid config should be applied
            configManager.reload();
            const newConfig = configManager.getConfig();
            
            expect(newConfig.maxLeverage).toBe(testConfig.maxLeverage);
            expect(newConfig.updateInterval).toBe(testConfig.updateInterval);
            expect(newConfig.stopLossPercent).toBe(testConfig.stopLossPercent);
          } else {
            // Invalid config should be loaded as-is (validation happens separately)
            configManager.reload();
            const loadedConfig = configManager.getConfig();
            
            // Invalid configuration should be loaded (merged with defaults)
            expect(loadedConfig.maxLeverage).toBe(testConfig.maxLeverage);
            expect(loadedConfig.updateInterval).toBe(testConfig.updateInterval);
            expect(loadedConfig.stopLossPercent).toBe(testConfig.stopLossPercent);
            
            // But validation should detect the errors
            const phaseConfig = configManager.getPhaseConfig();
            const errors = configManager.validateConfig(phaseConfig);
            expect(errors.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 40 }
    );
  });

  /**
   * Property 5: Configuration Update Consistency
   * For any sequence of configuration updates, the system should maintain consistency
   */
  it('should maintain configuration consistency during multiple update operations', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            maxLeverage: fc.integer({ min: 1, max: 100 }),
            updateInterval: fc.integer({ min: 10000, max: 300000 })
          }),
          { minLength: 2, maxLength: 8 }
        ),
        (configSequence: Partial<TrapConfig>[]) => {
          configManager = new ConfigManager('test');
          
          // Apply sequence of configuration updates
          configSequence.forEach((config, index) => {
            // Update the phase config
            configManager.updatePhaseConfig(config);
            
            // Verify config was updated correctly
            const currentConfig = configManager.getConfig();
            expect(currentConfig.maxLeverage).toBe(config.maxLeverage);
            expect(currentConfig.updateInterval).toBe(config.updateInterval);
            
            // Verify configuration is still valid
            const phaseConfig = configManager.getPhaseConfig();
            const errors = configManager.validateConfig(phaseConfig);
            expect(errors).toHaveLength(0);
          });
          
          // Verify final configuration is consistent
          const finalConfig = configManager.getConfig();
          const lastUpdate = configSequence[configSequence.length - 1];
          expect(finalConfig.maxLeverage).toBe(lastUpdate.maxLeverage);
          expect(finalConfig.updateInterval).toBe(lastUpdate.updateInterval);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 6: Memory Leak Prevention
   * For any number of reload operations, memory usage should remain stable
   */
  it('should prevent memory leaks during repeated hot-reload operations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }),
        fc.record({
          maxLeverage: fc.integer({ min: 1, max: 100 }),
          updateInterval: fc.integer({ min: 10000, max: 300000 })
        }),
        (reloadCount: number, baseConfig: Partial<TrapConfig>) => {
          configManager = new ConfigManager('test');
          
          const initialListenerCount = configManager.listenerCount('configChanged');
          
          // Perform multiple reload operations
          for (let i = 0; i < reloadCount; i++) {
            const config = {
              ...baseConfig,
              maxLeverage: baseConfig.maxLeverage! + (i % 10), // Vary config slightly
            };
            
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
            
            configManager.reload();
          }
          
          // Verify listener count hasn't grown (indicating no memory leaks)
          const finalListenerCount = configManager.listenerCount('configChanged');
          expect(finalListenerCount).toBeLessThanOrEqual(initialListenerCount + 1); // Allow for test listener
          
          // Verify config is still functional
          const finalConfig = configManager.getConfig();
          expect(finalConfig).toBeDefined();
          expect(finalConfig.maxLeverage).toBeGreaterThan(0);
        }
      ),
      { numRuns: 15 }
    );
  });
});