#!/usr/bin/env node

/**
 * Titan Trading System - Deployment Health Checker
 * 
 * Tests all deployed Titan services and reports their health status.
 * Exits with code 0 if all services are healthy, 1 otherwise.
 * 
 * Usage:
 *   node test-deployment.js [--json] [--verbose]
 * 
 * Options:
 *   --json     Output results in JSON format
 *   --verbose  Show detailed request information
 */

const https = require('https');
const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);
const isJsonOutput = args.includes('--json');
const isVerbose = args.includes('--verbose');

// Configuration constants
const CONFIG = {
  REQUEST_TIMEOUT: 10000, // 10 seconds
  USER_AGENT: 'Titan-Deployment-Tester/1.0',
  SUMMARY_SEPARATOR: '='.repeat(50)
};

// Status indicators
const STATUS_INDICATORS = {
  HEALTHY: '✅ HEALTHY',
  UNHEALTHY: '❌ UNHEALTHY',
  ERROR: '❌ ERROR',
  TIMEOUT: '❌ TIMEOUT'
};

const services = [

  {
    name: 'Titan Execution (Backend)',
    url: 'http://localhost:8080/health',
    expectedStatus: [200]
  },
  {
    name: 'Titan Brain (Backend)', 
    url: 'http://localhost:3100/status',
    expectedStatus: [200]
  }
];

/**
 * Creates a standardized test result object
 */
function createTestResult(service, status, healthy, message) {
  return {
    name: service.name,
    url: service.url,
    status,
    healthy,
    message
  };
}

/**
 * Makes HTTP request with timeout and error handling
 */
function makeRequest(service) {
  return new Promise((resolve) => {
    const url = new URL(service.url);
    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      timeout: CONFIG.REQUEST_TIMEOUT,
      headers: {
        'User-Agent': CONFIG.USER_AGENT
      }
    }, (res) => {
      const isHealthy = service.expectedStatus.includes(res.statusCode);
      const message = isHealthy ? STATUS_INDICATORS.HEALTHY : `${STATUS_INDICATORS.UNHEALTHY} (${res.statusCode})`;
      resolve(createTestResult(service, res.statusCode, isHealthy, message));
    });
    
    req.on('error', (err) => {
      const message = `${STATUS_INDICATORS.ERROR}: ${err.message}`;
      resolve(createTestResult(service, 'ERROR', false, message));
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve(createTestResult(service, 'TIMEOUT', false, STATUS_INDICATORS.TIMEOUT));
    });
    
    req.end();
  });
}

/**
 * Tests a single service endpoint
 */
async function testService(service) {
  return makeRequest(service);
}

/**
 * Tests all services and returns results
 */
async function testAllServices() {
  if (!isJsonOutput) {
    console.log('🚀 Testing Titan Trading System Deployment\n');
  }
  
  const results = [];
  
  for (const service of services) {
    if (!isJsonOutput) {
      console.log(`Testing ${service.name}...`);
    }
    
    const startTime = Date.now();
    const result = await testService(service);
    const responseTime = Date.now() - startTime;
    
    // Add response time to result
    result.responseTime = responseTime;
    
    if (isVerbose && !isJsonOutput) {
      console.log(`  Response time: ${responseTime}ms`);
    }
    
    results.push(result);
    
    if (!isJsonOutput) {
      console.log(`  ${result.message}\n`);
    }
  }
  
  return results;
}

/**
 * Displays summary of test results
 */
function displaySummary(results) {
  const healthyCount = results.filter(r => r.healthy).length;
  const allHealthy = healthyCount === results.length;
  
  if (isJsonOutput) {
    const summary = {
      timestamp: new Date().toISOString(),
      totalServices: results.length,
      healthyServices: healthyCount,
      allHealthy,
      results: results.map(r => ({
        name: r.name,
        url: r.url,
        status: r.status,
        healthy: r.healthy,
        responseTime: r.responseTime
      }))
    };
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('📊 DEPLOYMENT STATUS SUMMARY');
    console.log(CONFIG.SUMMARY_SEPARATOR);
    
    for (const result of results) {
      const timing = isVerbose ? ` (${result.responseTime}ms)` : '';
      console.log(`${result.message} ${result.name}${timing}`);
    }
    
    console.log(CONFIG.SUMMARY_SEPARATOR);
    console.log(`Overall Health: ${healthyCount}/${results.length} services healthy`);
  }
  
  return allHealthy;
}

/**
 * Main execution function
 */
async function main() {
  try {
    const results = await testAllServices();
    const allHealthy = displaySummary(results);
    
    if (!isJsonOutput) {
      if (allHealthy) {
        console.log('🎉 ALL SERVICES DEPLOYED SUCCESSFULLY!');
      } else {
        console.log('⚠️  Some services need attention');
      }
    }
    
    process.exit(allHealthy ? 0 : 1);
  } catch (error) {
    if (isJsonOutput) {
      console.log(JSON.stringify({
        error: true,
        message: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));
    } else {
      console.error('❌ Deployment test failed:', error.message);
    }
    process.exit(1);
  }
}

main().catch(console.error);