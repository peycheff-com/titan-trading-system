/**
 * Test setup for deployment service
 */

// Increase timeout for integration tests
jest.setTimeout(10000);

// Mock external dependencies that might not be available in test environment
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockRejectedValue(new Error('Redis not available in test')),
    disconnect: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    publish: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    duplicate: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn()
    }))
  }))
}));

// Mock WebSocket for testing
jest.mock('ws', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    terminate: jest.fn()
  }));
});

// Mock child_process for PM2 operations
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    on: jest.fn(),
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    kill: jest.fn(),
    killed: false,
    pid: 12345
  })),
  exec: jest.fn((cmd, callback) => {
    if (typeof callback === 'function') {
      if (cmd.includes('pm2 --version')) {
        callback(new Error('PM2 not installed'));
      } else {
        callback(null, { stdout: '[]', stderr: '' });
      }
    }
  })
}));

// Mock fs/promises with complete API
jest.mock('fs/promises', () => ({
  access: jest.fn().mockRejectedValue(new Error('File not found')),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{}'),
  mkdir: jest.fn().mockResolvedValue(undefined),
  mkdtemp: jest.fn().mockResolvedValue('/tmp/test-dir'),
  rm: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  stat: jest.fn().mockResolvedValue({ isDirectory: () => false, isFile: () => true }),
  copyFile: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined)
}));

// Mock fetch for HTTP health checks
global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));