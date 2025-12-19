# Deployment Service Tests

## Overview

This directory contains comprehensive tests for the Titan deployment service, organized by test type and following institutional-grade testing practices.

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual components
├── integration/             # Integration tests for component interactions
├── property/                # Property-based tests for correctness
├── utils/                   # Test utilities and helpers
├── setup.ts                 # Global test setup
└── globalSetup.js          # Jest global setup validation
```

## Test Types

### Unit Tests (`tests/unit/`)
- Test individual classes and functions in isolation
- Use mocks for external dependencies
- Fast execution (< 10 seconds per test)
- High code coverage requirements

### Integration Tests (`tests/integration/`)
- Test component interactions and workflows
- Use real file system operations in isolated directories
- Longer execution time allowed (< 30 seconds per test)
- Focus on end-to-end scenarios

### Property Tests (`tests/property/`)
- Test universal properties that should hold for all inputs
- Use `fast-check` for property generation
- Longer execution time for thorough testing (< 60 seconds per test)
- Validate correctness across input ranges

## Running Tests

```bash
# Run all tests
npm test

# Run specific test types
npm test -- --selectProjects unit
npm test -- --selectProjects integration
npm test -- --selectProjects property

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test -- BackupService.test.ts
```

## Test Utilities

### Configuration Factory (`tests/utils/configFactory.ts`)
Provides factory functions for creating complete test configurations:

```typescript
import { createTestPerformanceConfig } from '@test-utils/configFactory';

const config = createTestPerformanceConfig({
  nodejs: { maxOldSpaceSize: 2048 }
});
```

### Error Utilities (`tests/utils/errorUtils.ts`)
Provides type-safe error handling utilities:

```typescript
import { getErrorMessage, isError } from '@test-utils/errorUtils';

try {
  // some operation
} catch (error) {
  const message = getErrorMessage(error);
  if (isError(error)) {
    // Handle Error instance
  }
}
```

## Best Practices

### 1. Test Organization
- Group related tests using `describe` blocks
- Use descriptive test names that explain the expected behavior
- Follow the Arrange-Act-Assert pattern

### 2. Mock Management
- Use the global setup in `tests/setup.ts` for common mocks
- Create specific mocks in individual test files when needed
- Always clean up mocks between tests

### 3. Async Testing
- Always use `async/await` for asynchronous operations
- Set appropriate timeouts for long-running operations
- Handle promise rejections properly

### 4. Error Testing
- Test both success and failure scenarios
- Use type-safe error handling utilities
- Verify error messages and codes

### 5. Integration Testing
- Use isolated temporary directories
- Clean up resources in `afterEach` hooks
- Test realistic scenarios with actual file operations

## Configuration

### Jest Configuration (`jest.config.js`)
- Uses `ts-jest` preset for TypeScript support
- Separate project configurations for different test types
- Optimized for both development and CI environments

### TypeScript Configuration
- Relaxed strict mode for tests to allow flexibility
- Module path mapping for easy imports
- Optimized compilation settings for test performance

## Troubleshooting

### Common Issues

1. **Mock not working**: Check if the mock is defined in the correct setup file
2. **Timeout errors**: Increase timeout for long-running tests or optimize the test
3. **Type errors**: Use the error utilities or add type assertions where needed
4. **File system errors**: Ensure proper cleanup in `afterEach` hooks

### Debug Mode

```bash
# Run tests with debug output
npm test -- --verbose

# Run single test with full output
npm test -- --testNamePattern="specific test name" --verbose
```

## Requirements Validation

The tests validate the following requirements from the deployment specification:

- **Infrastructure**: Service deployment and validation
- **Security**: TLS configuration and access control
- **Configuration**: Hot-reload and encryption
- **Monitoring**: Metrics collection and alerting
- **Backup**: Automated backup and recovery
- **Rollback**: Version management and rollback procedures
- **Performance**: System optimization and tuning

Each test file includes requirement references in comments for traceability.