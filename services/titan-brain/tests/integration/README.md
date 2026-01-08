# Titan Brain Integration Tests

This directory contains comprehensive integration tests for the Titan Brain service. These tests verify the complete system functionality including database connectivity, cache operations, webhook processing, and end-to-end workflows.

## Test Structure

```
tests/integration/
├── README.md                           # This file
├── setup.ts                           # Global test setup and utilities
├── env.ts                             # Environment configuration
├── WebhookServer.integration.test.ts  # Server integration tests
├── DatabaseManager.integration.test.ts # Database integration tests
├── CacheManager.integration.test.ts   # Cache integration tests
├── StartupManager.integration.test.ts # Startup sequence tests
└── EndToEnd.integration.test.ts       # Complete system tests
```

## Prerequisites

### Required Services

Integration tests require the following external services to be running:

1. **PostgreSQL Database**
   - Host: `localhost` (or set `TEST_DB_HOST`)
   - Port: `5432` (or set `TEST_DB_PORT`)
   - Database: `test_titan_brain` (or set `TEST_DB_NAME`)
   - User: `test_user` (or set `TEST_DB_USER`)
   - Password: `test_password` (or set `TEST_DB_PASSWORD`)

2. **Redis Cache**
   - Host: `localhost` (or set `TEST_REDIS_HOST`)
   - Port: `6379` (or set `TEST_REDIS_PORT`)
   - Database: `15` (or set `TEST_REDIS_DB`)
   - Password: optional (set `TEST_REDIS_PASSWORD` if needed)

### Docker Setup (Recommended)

Use Docker Compose to start test services:

```yaml
# docker-compose.test.yml
version: '3.8'
services:
  test-postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: test_titan_brain
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_password
    ports:
      - "5432:5432"
    volumes:
      - test_postgres_data:/var/lib/postgresql/data

  test-redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - test_redis_data:/data

volumes:
  test_postgres_data:
  test_redis_data:
```

Start services:
```bash
docker-compose -f docker-compose.test.yml up -d
```

### Manual Setup

#### PostgreSQL Setup
```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt-get install postgresql postgresql-contrib

# Create test database and user
sudo -u postgres psql
CREATE DATABASE test_titan_brain;
CREATE USER test_user WITH PASSWORD 'test_password';
GRANT ALL PRIVILEGES ON DATABASE test_titan_brain TO test_user;
\\q
```

#### Redis Setup
```bash
# Install Redis (Ubuntu/Debian)
sudo apt-get install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test connection
redis-cli ping
```

## Environment Variables

Configure tests using environment variables:

```bash
# Database configuration
export TEST_DB_HOST=localhost
export TEST_DB_PORT=5432
export TEST_DB_NAME=test_titan_brain
export TEST_DB_USER=test_user
export TEST_DB_PASSWORD=test_password
export TEST_DB_SSL=false

# Redis configuration
export TEST_REDIS_HOST=localhost
export TEST_REDIS_PORT=6379
export TEST_REDIS_PASSWORD=
export TEST_REDIS_DB=15

# Test configuration
export TEST_TIMEOUT=60000
export TEST_VERBOSE=false
export TEST_PARALLEL=false
```

## Running Tests

### All Integration Tests
```bash
npm run test:integration
```

### Specific Test Files
```bash
# Database tests only
npx jest --config jest.integration.config.js DatabaseManager.integration.test.ts

# Cache tests only
npx jest --config jest.integration.config.js CacheManager.integration.test.ts

# End-to-end tests only
npx jest --config jest.integration.config.js EndToEnd.integration.test.ts
```

### With Coverage
```bash
npm run test:coverage:integration
```

### Watch Mode
```bash
npm run test:watch:integration
```

### Verbose Output
```bash
TEST_VERBOSE=true npm run test:integration
```

## Test Categories

### 1. WebhookServer Integration Tests
- **File**: `WebhookServer.integration.test.ts`
- **Purpose**: Tests the complete webhook server functionality
- **Coverage**:
  - Health endpoints
  - Metrics endpoints
  - Rate limiting
  - HMAC validation
  - CORS handling
  - Error handling
  - Performance under load

### 2. DatabaseManager Integration Tests
- **File**: `DatabaseManager.integration.test.ts`
- **Purpose**: Tests actual database connectivity and operations
- **Coverage**:
  - Connection management
  - Query operations (SELECT, INSERT, UPDATE, DELETE)
  - Transaction support
  - Connection pooling
  - Health monitoring
  - Error handling
  - Performance benchmarks

### 3. CacheManager Integration Tests
- **File**: `CacheManager.integration.test.ts`
- **Purpose**: Tests Redis connectivity and cache operations
- **Coverage**:
  - Redis connection management
  - In-memory fallback behavior
  - Basic cache operations (GET, SET, DELETE)
  - TTL expiration
  - Concurrent operations
  - Health monitoring
  - Performance benchmarks

### 4. StartupManager Integration Tests
- **File**: `StartupManager.integration.test.ts`
- **Purpose**: Tests the complete startup and shutdown sequence
- **Coverage**:
  - Startup sequence validation
  - Component initialization
  - Health monitoring during startup
  - Error recovery
  - Graceful shutdown
  - Configuration validation

### 5. End-to-End Integration Tests
- **File**: `EndToEnd.integration.test.ts`
- **Purpose**: Tests the complete system integration
- **Coverage**:
  - Full system startup
  - Webhook processing workflows
  - Authentication and security
  - Rate limiting under load
  - Error handling and recovery
  - Performance under sustained load
  - Graceful shutdown

## Test Data Management

### Database Cleanup
Tests automatically clean up test data:
- Each test uses unique identifiers
- Test tables are created and dropped as needed
- Connection pools are properly closed

### Cache Cleanup
Cache tests use separate Redis databases:
- Each test file uses a different Redis DB number
- Test keys use `test:*` prefixes
- Keys are automatically cleaned up after tests

### Isolation
Tests are designed to be independent:
- No shared state between tests
- Each test can run in isolation
- Parallel execution is supported (with limitations)

## Performance Benchmarks

Integration tests include performance benchmarks:

### Database Performance
- Query execution time
- Connection pool efficiency
- Concurrent query handling
- Transaction performance

### Cache Performance
- Operation latency (GET, SET, DELETE)
- Throughput under load
- Memory usage
- Fallback performance

### Server Performance
- Request/response latency
- Concurrent request handling
- Memory usage under load
- Startup/shutdown time

## Troubleshooting

### Common Issues

#### Database Connection Failures
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution**: Ensure PostgreSQL is running and accessible
```bash
sudo systemctl status postgresql
sudo systemctl start postgresql
```

#### Redis Connection Failures
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```
**Solution**: Ensure Redis is running and accessible
```bash
sudo systemctl status redis-server
sudo systemctl start redis-server
```

#### Permission Errors
```
Error: permission denied for database "test_titan_brain"
```
**Solution**: Grant proper permissions to test user
```sql
GRANT ALL PRIVILEGES ON DATABASE test_titan_brain TO test_user;
GRANT ALL ON SCHEMA public TO test_user;
```

#### Test Timeouts
```
Error: Timeout - Async callback was not invoked within the 60000 ms timeout
```
**Solution**: Increase timeout or check service connectivity
```bash
export TEST_TIMEOUT=120000
```

### Debug Mode

Enable verbose logging:
```bash
TEST_VERBOSE=true npm run test:integration
```

Run single test with debugging:
```bash
node --inspect-brk node_modules/.bin/jest --config jest.integration.config.js --runInBand EndToEnd.integration.test.ts
```

### Service Health Checks

Verify external services before running tests:
```bash
# Check PostgreSQL
pg_isready -h localhost -p 5432

# Check Redis
redis-cli ping

# Check connectivity from Node.js
node -e "
const { Client } = require('pg');
const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'test_titan_brain',
  user: 'test_user',
  password: 'test_password'
});
client.connect().then(() => {
  console.log('PostgreSQL: Connected');
  client.end();
}).catch(err => {
  console.error('PostgreSQL: Failed', err.message);
});

const redis = require('redis');
const redisClient = redis.createClient({
  socket: { host: 'localhost', port: 6379 }
});
redisClient.connect().then(() => {
  console.log('Redis: Connected');
  redisClient.disconnect();
}).catch(err => {
  console.error('Redis: Failed', err.message);
});
"
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: test_titan_brain
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
        working-directory: services/titan-brain
      
      - name: Run integration tests
        run: npm run test:integration
        working-directory: services/titan-brain
        env:
          TEST_DB_HOST: localhost
          TEST_DB_PORT: 5432
          TEST_DB_NAME: test_titan_brain
          TEST_DB_USER: test_user
          TEST_DB_PASSWORD: test_password
          TEST_REDIS_HOST: localhost
          TEST_REDIS_PORT: 6379
```

## Best Practices

### Test Design
1. **Independence**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up test data and connections
3. **Timeouts**: Use appropriate timeouts for async operations
4. **Error Handling**: Test both success and failure scenarios
5. **Performance**: Include performance assertions where relevant

### Resource Management
1. **Connection Pooling**: Use connection pools efficiently
2. **Memory Usage**: Monitor memory usage in long-running tests
3. **Cleanup**: Properly close connections and clean up resources
4. **Isolation**: Use separate databases/namespaces for different test suites

### Debugging
1. **Logging**: Use structured logging for debugging
2. **Correlation IDs**: Include correlation IDs in test requests
3. **Metrics**: Monitor test execution metrics
4. **Health Checks**: Verify service health before running tests

## Contributing

When adding new integration tests:

1. **Follow Naming Convention**: Use `*.integration.test.ts` suffix
2. **Add Documentation**: Document test purpose and coverage
3. **Include Cleanup**: Ensure proper resource cleanup
4. **Performance Tests**: Include performance assertions where relevant
5. **Error Scenarios**: Test both success and failure paths
6. **Update README**: Update this README with new test information