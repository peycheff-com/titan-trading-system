/**
 * Integration Test Setup
 * 
 * Additional setup for integration tests that require more complex initialization
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Note: Don't set timeout here as it's handled by Jest config

// Setup test directories before all integration tests
beforeAll(async () => {
  // Ensure test directories exist with proper error handling
  const testDirs = [
    './test-deployment',
    './test-deployment/versions',
    './test-deployment/backups',
    './test-deployment/logs'
  ];

  for (const dir of testDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Only log if it's not an EEXIST error
      if (error && (error as any).code !== 'EEXIST') {
        console.warn(`Failed to create test directory ${dir}:`, error);
      }
    }
  }
}, 60000); // Explicit timeout for setup

// Cleanup after all integration tests
afterAll(async () => {
  // Clean up test directories with retry logic
  const maxRetries = 3;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await fs.rm('./test-deployment', { recursive: true, force: true });
      break;
    } catch (error) {
      retries++;
      if (retries === maxRetries) {
        console.warn('Failed to cleanup test directories after', maxRetries, 'attempts:', error);
      } else {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}, 30000); // Explicit timeout for cleanup

// Mock external services for integration tests
jest.mock('../../PM2Manager', () => ({
  PM2Manager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    startService: jest.fn().mockResolvedValue({ success: true }),
    stopService: jest.fn().mockResolvedValue({ success: true }),
    restartService: jest.fn().mockResolvedValue({ success: true }),
    getServiceStatus: jest.fn().mockResolvedValue({ status: 'online' })
  }))
}));

jest.mock('../../DeploymentValidator', () => ({
  DeploymentValidator: jest.fn().mockImplementation(() => ({
    validateDeployment: jest.fn().mockResolvedValue({ 
      valid: true, 
      issues: [] 
    }),
    quickHealthCheck: jest.fn().mockResolvedValue({ 
      healthy: true, 
      issues: [] 
    })
  }))
}));