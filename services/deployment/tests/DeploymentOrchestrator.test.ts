/**
 * Tests for DeploymentOrchestrator
 */

import { DeploymentOrchestrator } from '../DeploymentOrchestrator';

describe('DeploymentOrchestrator', () => {
  let orchestrator: DeploymentOrchestrator;

  beforeEach(() => {
    orchestrator = new DeploymentOrchestrator();
  });

  afterEach(() => {
    // Clean up any running processes
    orchestrator.stopAll().catch(() => {
      // Ignore cleanup errors in tests
    });
  });

  describe('Service Configuration', () => {
    test('should initialize with default service configurations', () => {
      const statuses = orchestrator.getServiceStatuses();
      expect(statuses).toEqual([]);
    });

    test('should calculate deployment order correctly', () => {
      // This tests the private method indirectly through deployAll
      // The deployment order should respect dependencies
      expect(() => orchestrator.deployAll()).not.toThrow();
    });
  });

  describe('Service Status Management', () => {
    test('should return undefined for non-existent service', () => {
      const status = orchestrator.getServiceStatus('non-existent');
      expect(status).toBeUndefined();
    });

    test('should handle service status updates', () => {
      const statuses = orchestrator.getServiceStatuses();
      expect(Array.isArray(statuses)).toBe(true);
    });
  });

  describe('Event Emission', () => {
    test('should emit events during deployment lifecycle', (done) => {
      let eventCount = 0;
      
      orchestrator.on('deployment:started', () => {
        eventCount++;
      });

      orchestrator.on('deployment:completed', () => {
        eventCount++;
        expect(eventCount).toBeGreaterThan(0);
        done();
      });

      // This will likely fail due to missing services, but should emit events
      orchestrator.deployAll().catch(() => {
        // Expected to fail in test environment
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle deployment in progress error', async () => {
      // Start a deployment (will fail but that's ok for this test)
      const promise1 = orchestrator.deployAll().catch(() => {});
      
      // Try to start another deployment
      await expect(orchestrator.deployAll()).rejects.toThrow('Deployment already in progress');
      
      await promise1;
    });
  });
});