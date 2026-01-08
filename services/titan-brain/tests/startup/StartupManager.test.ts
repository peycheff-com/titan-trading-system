/**
 * StartupManager Tests
 * 
 * Comprehensive unit tests for the StartupManager class covering
 * initialization, step execution, error handling, and graceful shutdown.
 */

import { StartupManager, StartupStep, StartupStatus } from '../../src/startup/StartupManager.js';
import { Logger } from '../../src/logging/Logger.js';

// Mock Logger
jest.mock('../../src/logging/Logger.js');

describe('StartupManager', () => {
  let startupManager: StartupManager;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      logSecurityEvent: jest.fn()
    } as any;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    // Create startup manager with test configuration
    startupManager = new StartupManager({
      maxStartupTime: 10000,
      stepTimeout: 2000,
      maxRetries: 2,
      retryDelay: 100,
      gracefulShutdownTimeout: 5000,
      validateEnvironment: false // Disable for most tests
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clean up any running processes
    if (startupManager) {
      startupManager.removeAllListeners();
    }
  });

  describe('Step Registration', () => {
    it('should register a startup step successfully', () => {
      const step: StartupStep = {
        name: 'test-step',
        description: 'Test step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      expect(() => startupManager.registerStep(step)).not.toThrow();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Startup step registered: test-step',
        undefined,
        expect.objectContaining({
          description: 'Test step',
          timeout: 1000,
          required: true,
          dependencies: []
        })
      );
    });

    it('should prevent registration after startup has begun', async () => {
      const step: StartupStep = {
        name: 'test-step',
        description: 'Test step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      startupManager.registerStep(step);
      await startupManager.start();

      const newStep: StartupStep = {
        name: 'new-step',
        description: 'New step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      expect(() => startupManager.registerStep(newStep)).toThrow(
        'Cannot register steps after startup has begun'
      );
    });

    it('should emit step:registered event', () => {
      const eventSpy = jest.fn();
      startupManager.on('step:registered', eventSpy);

      const step: StartupStep = {
        name: 'test-step',
        description: 'Test step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      startupManager.registerStep(step);

      expect(eventSpy).toHaveBeenCalledWith({ name: 'test-step' });
    });
  });

  describe('Startup Execution', () => {
    it('should execute steps successfully', async () => {
      const executeStep1 = jest.fn().mockResolvedValue(undefined);
      const executeStep2 = jest.fn().mockResolvedValue(undefined);

      const step1: StartupStep = {
        name: 'step1',
        description: 'First step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: executeStep1
      };

      const step2: StartupStep = {
        name: 'step2',
        description: 'Second step',
        timeout: 1000,
        required: true,
        dependencies: ['step1'],
        execute: executeStep2
      };

      startupManager.registerStep(step1);
      startupManager.registerStep(step2);

      await startupManager.start();

      expect(executeStep1).toHaveBeenCalled();
      expect(executeStep2).toHaveBeenCalled();
      expect(startupManager.isStartupComplete()).toBe(true);
    });

    it('should execute steps in dependency order', async () => {
      const executionOrder: string[] = [];

      const step1: StartupStep = {
        name: 'step1',
        description: 'First step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockImplementation(() => {
          executionOrder.push('step1');
          return Promise.resolve();
        })
      };

      const step2: StartupStep = {
        name: 'step2',
        description: 'Second step',
        timeout: 1000,
        required: true,
        dependencies: ['step1'],
        execute: jest.fn().mockImplementation(() => {
          executionOrder.push('step2');
          return Promise.resolve();
        })
      };

      const step3: StartupStep = {
        name: 'step3',
        description: 'Third step',
        timeout: 1000,
        required: true,
        dependencies: ['step1', 'step2'],
        execute: jest.fn().mockImplementation(() => {
          executionOrder.push('step3');
          return Promise.resolve();
        })
      };

      startupManager.registerStep(step1);
      startupManager.registerStep(step2);
      startupManager.registerStep(step3);

      await startupManager.start();

      expect(executionOrder).toEqual(['step1', 'step2', 'step3']);
    });

    it('should detect circular dependencies', () => {
      const step1: StartupStep = {
        name: 'step1',
        description: 'First step',
        timeout: 1000,
        required: true,
        dependencies: ['step2'],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      const step2: StartupStep = {
        name: 'step2',
        description: 'Second step',
        timeout: 1000,
        required: true,
        dependencies: ['step1'],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      startupManager.registerStep(step1);
      startupManager.registerStep(step2);

      expect(startupManager.start()).rejects.toThrow(
        'Circular dependency detected involving step: step1'
      );
    });

    it('should fail if required step fails', async () => {
      const step: StartupStep = {
        name: 'failing-step',
        description: 'Failing step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockRejectedValue(new Error('Step failed'))
      };

      startupManager.registerStep(step);

      await expect(startupManager.start()).rejects.toThrow(
        'Required startup step failed: failing-step - Step failed'
      );
    });

    it('should continue if optional step fails', async () => {
      const failingStep: StartupStep = {
        name: 'failing-step',
        description: 'Failing step',
        timeout: 1000,
        required: false,
        dependencies: [],
        execute: jest.fn().mockRejectedValue(new Error('Step failed'))
      };

      const successStep: StartupStep = {
        name: 'success-step',
        description: 'Success step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      startupManager.registerStep(failingStep);
      startupManager.registerStep(successStep);

      await startupManager.start();

      expect(startupManager.isStartupComplete()).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Optional startup step failed, continuing: failing-step'
      );
    });

    it('should retry failed steps', async () => {
      let attemptCount = 0;
      const step: StartupStep = {
        name: 'retry-step',
        description: 'Retry step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 2) {
            return Promise.reject(new Error('Temporary failure'));
          }
          return Promise.resolve();
        })
      };

      startupManager.registerStep(step);

      await startupManager.start();

      expect(attemptCount).toBe(2);
      expect(startupManager.isStartupComplete()).toBe(true);
    });

    it('should timeout steps that take too long', async () => {
      const step: StartupStep = {
        name: 'slow-step',
        description: 'Slow step',
        timeout: 100,
        required: true,
        dependencies: [],
        execute: jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, 200))
        )
      };

      startupManager.registerStep(step);

      await expect(startupManager.start()).rejects.toThrow(
        'Required startup step failed: slow-step - Step timeout: slow-step'
      );
    });

    it('should timeout entire startup if it takes too long', async () => {
      const step: StartupStep = {
        name: 'slow-step',
        description: 'Slow step',
        timeout: 15000, // Longer than maxStartupTime
        required: true,
        dependencies: [],
        execute: jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, 12000))
        )
      };

      startupManager.registerStep(step);

      await expect(startupManager.start()).rejects.toThrow(
        /Startup timeout exceeded/
      );
    });

    it('should prevent multiple starts', async () => {
      const step: StartupStep = {
        name: 'test-step',
        description: 'Test step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      startupManager.registerStep(step);
      await startupManager.start();

      await expect(startupManager.start()).rejects.toThrow(
        'Startup manager has already been started'
      );
    });
  });

  describe('Environment Validation', () => {
    it('should validate environment when enabled', async () => {
      // Set required environment variables
      process.env.NODE_ENV = 'test';
      process.env.PORT = '3000';
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

      const startupManagerWithValidation = new StartupManager({
        validateEnvironment: true
      });

      const step: StartupStep = {
        name: 'test-step',
        description: 'Test step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      startupManagerWithValidation.registerStep(step);

      await expect(startupManagerWithValidation.start()).resolves.not.toThrow();

      // Clean up
      delete process.env.NODE_ENV;
      delete process.env.PORT;
      delete process.env.DATABASE_URL;
    });

    it('should fail validation with missing required variables', async () => {
      // Ensure required variables are not set
      delete process.env.NODE_ENV;
      delete process.env.PORT;
      delete process.env.DATABASE_URL;

      const startupManagerWithValidation = new StartupManager({
        validateEnvironment: true
      });

      const step: StartupStep = {
        name: 'test-step',
        description: 'Test step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      startupManagerWithValidation.registerStep(step);

      await expect(startupManagerWithValidation.start()).rejects.toThrow(
        /Environment validation failed/
      );
    });
  });

  describe('Events', () => {
    it('should emit startup events', async () => {
      const startedSpy = jest.fn();
      const completedSpy = jest.fn();

      startupManager.on('startup:started', startedSpy);
      startupManager.on('startup:completed', completedSpy);

      const step: StartupStep = {
        name: 'test-step',
        description: 'Test step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      startupManager.registerStep(step);
      await startupManager.start();

      expect(startedSpy).toHaveBeenCalled();
      expect(completedSpy).toHaveBeenCalledWith(
        expect.objectContaining({ duration: expect.any(Number) })
      );
    });

    it('should emit step events', async () => {
      const stepStartedSpy = jest.fn();
      const stepCompletedSpy = jest.fn();

      startupManager.on('step:started', stepStartedSpy);
      startupManager.on('step:completed', stepCompletedSpy);

      const step: StartupStep = {
        name: 'test-step',
        description: 'Test step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      startupManager.registerStep(step);
      await startupManager.start();

      expect(stepStartedSpy).toHaveBeenCalledWith({ name: 'test-step' });
      expect(stepCompletedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-step',
          status: StartupStatus.COMPLETED,
          duration: expect.any(Number)
        })
      );
    });

    it('should emit failure events', async () => {
      const startupFailedSpy = jest.fn();
      const stepFailedSpy = jest.fn();

      startupManager.on('startup:failed', startupFailedSpy);
      startupManager.on('step:failed', stepFailedSpy);

      const step: StartupStep = {
        name: 'failing-step',
        description: 'Failing step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockRejectedValue(new Error('Step failed'))
      };

      startupManager.registerStep(step);

      await expect(startupManager.start()).rejects.toThrow();

      expect(stepFailedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'failing-step',
          status: StartupStatus.FAILED,
          error: expect.any(Error)
        })
      );

      expect(startupFailedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          duration: expect.any(Number)
        })
      );
    });
  });

  describe('Status and Results', () => {
    it('should track startup results', async () => {
      const step1: StartupStep = {
        name: 'step1',
        description: 'First step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      const step2: StartupStep = {
        name: 'step2',
        description: 'Second step',
        timeout: 1000,
        required: false,
        dependencies: [],
        execute: jest.fn().mockRejectedValue(new Error('Optional failure'))
      };

      startupManager.registerStep(step1);
      startupManager.registerStep(step2);

      await startupManager.start();

      const results = startupManager.getResults();
      expect(results).toHaveLength(2);

      const step1Result = results.find(r => r.name === 'step1');
      const step2Result = results.find(r => r.name === 'step2');

      expect(step1Result?.status).toBe(StartupStatus.COMPLETED);
      expect(step2Result?.status).toBe(StartupStatus.FAILED);
    });

    it('should provide status summary', async () => {
      const step: StartupStep = {
        name: 'test-step',
        description: 'Test step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockResolvedValue(undefined)
      };

      startupManager.registerStep(step);

      // Before startup
      let summary = startupManager.getStatusSummary();
      expect(summary.started).toBe(false);
      expect(summary.completed).toBe(false);

      await startupManager.start();

      // After startup
      summary = startupManager.getStatusSummary();
      expect(summary.started).toBe(true);
      expect(summary.completed).toBe(true);
      expect(summary.totalSteps).toBe(1);
      expect(summary.completedSteps).toBe(1);
      expect(summary.failedSteps).toBe(0);
    });

    it('should calculate startup duration', async () => {
      const step: StartupStep = {
        name: 'test-step',
        description: 'Test step',
        timeout: 1000,
        required: true,
        dependencies: [],
        execute: jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, 100))
        )
      };

      startupManager.registerStep(step);

      const startTime = Date.now();
      await startupManager.start();
      const endTime = Date.now();

      const duration = startupManager.getStartupDuration();
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThanOrEqual(endTime - startTime + 10); // Allow small margin
    });
  });

  describe('Shutdown Handlers', () => {
    it('should register and execute shutdown handlers', async () => {
      const shutdownHandler1 = jest.fn().mockResolvedValue(undefined);
      const shutdownHandler2 = jest.fn().mockResolvedValue(undefined);

      startupManager.registerShutdownHandler(shutdownHandler1);
      startupManager.registerShutdownHandler(shutdownHandler2);

      await startupManager.shutdown();

      expect(shutdownHandler1).toHaveBeenCalled();
      expect(shutdownHandler2).toHaveBeenCalled();
    });

    it('should handle shutdown handler failures', async () => {
      const failingHandler = jest.fn().mockRejectedValue(new Error('Shutdown failed'));
      const successHandler = jest.fn().mockResolvedValue(undefined);

      startupManager.registerShutdownHandler(failingHandler);
      startupManager.registerShutdownHandler(successHandler);

      await expect(startupManager.shutdown()).rejects.toThrow('Shutdown failed');

      expect(failingHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should timeout shutdown if it takes too long', async () => {
      const slowHandler = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 6000))
      );

      startupManager.registerShutdownHandler(slowHandler);

      await expect(startupManager.shutdown()).rejects.toThrow('Shutdown timeout');
    });

    it('should prevent multiple shutdowns', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      startupManager.registerShutdownHandler(handler);

      const shutdown1 = startupManager.shutdown();
      const shutdown2 = startupManager.shutdown();

      await shutdown1;
      await shutdown2;

      // Second shutdown should not execute handlers again
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});