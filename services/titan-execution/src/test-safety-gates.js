/**
 * Test Script for Safety Gates
 * 
 * Simulates signals through the pipeline to verify gates work correctly.
 * Run with: node test-safety-gates.js
 */

import { SafetyGates } from './SafetyGates.js';

async function runTests() {
    console.log('='.repeat(60));
    console.log('Safety Gates Test Suite');
    console.log('='.repeat(60));

    const safetyGates = new SafetyGates({
        maxConsecutiveLosses: 3,
        maxDailyDrawdownPct: 0.05,
        maxWeeklyDrawdownPct: 0.10,
        cooldownHours: 4,
        extremeGreedThreshold: 100,
        highGreedThreshold: 50,
        extremeFearThreshold: -50,
    });

    // Initialize with $10,000 equity
    await safetyGates.initialize(10000, 'BTCUSDT');
    console.log('\n✅ Safety gates initialized with $10,000 equity\n');

    // Test 1: Normal signal (should pass)
    console.log('Test 1: Normal LONG signal');
    const signal1 = await safetyGates.processSignal({
        signal_id: 'test_001',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        size: 0.1,
    });
    console.log('  Result:', signal1.blocked ? '❌ BLOCKED' : '✅ ALLOWED');
    console.log('  Size multiplier:', signal1.sizeMultiplier || 1);
    console.log('  Regime:', signal1.regimeData?.regime || 'N/A');
    console.log();

    // Test 2: Simulate consecutive losses
    console.log('Test 2: Circuit breaker after 3 consecutive losses');
    safetyGates.recordTrade({ pnl: -100, equity: 9900 });
    console.log('  Recorded loss 1: -$100');
    safetyGates.recordTrade({ pnl: -100, equity: 9800 });
    console.log('  Recorded loss 2: -$100');
    safetyGates.recordTrade({ pnl: -100, equity: 9700 });
    console.log('  Recorded loss 3: -$100');

    const signal2 = await safetyGates.processSignal({
        signal_id: 'test_002',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        size: 0.1,
    });
    console.log('  Result:', signal2.blocked ? '❌ BLOCKED' : '✅ ALLOWED');
    console.log('  Block reason:', signal2.blockReason || 'N/A');
    console.log();

    // Reset circuit breaker for next tests
    safetyGates.circuitBreaker.reset();
    console.log('  Circuit breaker manually reset\n');

    // Test 3: Check status
    console.log('Test 3: Safety gates status');
    const status = safetyGates.getStatus();
    console.log('  Trading allowed:', status.tradingAllowed);
    console.log('  Circuit breaker tripped:', status.circuitBreaker.tripped);
    console.log('  Liquidation paused:', status.liquidationPaused);
    console.log('  Rate limiter healthy:', status.rateLimiter.healthy);
    console.log();

    // Test 4: Winning trade resets consecutive losses
    console.log('Test 4: Winning trade resets consecutive loss counter');
    safetyGates.recordTrade({ pnl: -100, equity: 9600 });
    safetyGates.recordTrade({ pnl: -100, equity: 9500 });
    console.log('  Recorded 2 losses');
    safetyGates.recordTrade({ pnl: 200, equity: 9700 });
    console.log('  Recorded 1 win');
    console.log('  Consecutive losses:', safetyGates.circuitBreaker.state.consecutiveLosses);
    console.log('  Expected: 0');
    console.log();

    // Stop the pipeline
    safetyGates.stop();

    console.log('='.repeat(60));
    console.log('All tests completed');
    console.log('='.repeat(60));
}

runTests().catch(console.error);
