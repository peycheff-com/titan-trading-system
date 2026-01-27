#!/usr/bin/env node
/**
 * Chaos Engineering Tests for Titan
 *
 * Tests system resilience under various failure conditions:
 * - IPC connection loss and recovery
 * - High-frequency signal bursts
 * - NATS disconnection handling
 * - Execution engine timeout simulation
 *
 * Usage:
 *   npx tsx scripts/verification/chaos-tests.ts [test-name]
 *
 * Tests:
 *   reconnect       - Test IPC reconnection after disconnect
 *   burst           - High-frequency signal burst test
 *   timeout         - Simulated timeout handling
 *   all             - Run all tests
 */
import { FastPathClient } from "@titan/shared";
// Configuration
const config = {
    socketPath: process.env.TITAN_IPC_SOCKET || "/tmp/titan-ipc.sock",
    hmacSecret: process.env.TITAN_HMAC_SECRET || "titan-hmac-secret",
};
/**
 * Test 1: IPC Reconnection
 * Verifies the client can reconnect after connection loss
 */
async function testReconnection() {
    const startTime = Date.now();
    const client = new FastPathClient({
        source: "brain",
        socketPath: config.socketPath,
        hmacSecret: config.hmacSecret,
    });
    try {
        // Initial connection
        console.log("  📡 Connecting...");
        await client.connect();
        if (!client.isConnected()) {
            return {
                name: "Reconnection",
                passed: false,
                duration: Date.now() - startTime,
                details: "Initial connection failed",
            };
        }
        // Send a test signal
        console.log("  📤 Sending test signal...");
        const signal = createTestSignal("reconnect-1");
        await client.sendPrepare(signal);
        await client.sendAbort(signal.signal_id);
        // Disconnect
        console.log("  🔌 Disconnecting...");
        await client.disconnect();
        // Wait a moment
        await sleep(500);
        // Reconnect
        console.log("  🔄 Reconnecting...");
        await client.connect();
        if (!client.isConnected()) {
            return {
                name: "Reconnection",
                passed: false,
                duration: Date.now() - startTime,
                details: "Reconnection failed",
            };
        }
        // Send another signal to verify
        console.log("  📤 Sending verification signal...");
        const signal2 = createTestSignal("reconnect-2");
        const result = await client.sendPrepare(signal2);
        await client.sendAbort(signal2.signal_id);
        await client.disconnect();
        return {
            name: "Reconnection",
            passed: true,
            duration: Date.now() - startTime,
            details: `Reconnection successful, PREPARE returned: ${result.prepared}`,
        };
    }
    catch (error) {
        await client.disconnect().catch(() => { });
        return {
            name: "Reconnection",
            passed: false,
            duration: Date.now() - startTime,
            details: `Error: ${error.message}`,
        };
    }
}
/**
 * Test 2: High-Frequency Signal Burst
 * Sends many signals rapidly to test throughput and queuing
 */
async function testBurst() {
    const startTime = Date.now();
    const burstSize = 50;
    const client = new FastPathClient({
        source: "brain",
        socketPath: config.socketPath,
        hmacSecret: config.hmacSecret,
    });
    try {
        await client.connect();
        console.log(`  🚀 Sending ${burstSize} signals in rapid succession...`);
        const results = await Promise.allSettled(Array.from({ length: burstSize }, async (_, i) => {
            const signal = createTestSignal(`burst-${i}`);
            const result = await client.sendPrepare(signal);
            await client.sendAbort(signal.signal_id);
            return result;
        }));
        const successful = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected").length;
        await client.disconnect();
        const throughput = burstSize / ((Date.now() - startTime) / 1000);
        return {
            name: "Burst",
            passed: successful >= burstSize * 0.95, // 95% success threshold
            duration: Date.now() - startTime,
            details: `${successful}/${burstSize} successful, ${failed} failed, ${throughput.toFixed(1)} signals/sec`,
        };
    }
    catch (error) {
        await client.disconnect().catch(() => { });
        return {
            name: "Burst",
            passed: false,
            duration: Date.now() - startTime,
            details: `Error: ${error.message}`,
        };
    }
}
/**
 * Test 3: Graceful Timeout Handling
 * Tests that timeouts are handled gracefully without crashing
 */
async function testTimeout() {
    const startTime = Date.now();
    const client = new FastPathClient({
        source: "brain",
        socketPath: config.socketPath,
        hmacSecret: config.hmacSecret,
        connectionTimeout: 1000, // 1 second timeout for testing
    });
    try {
        await client.connect();
        // Send signal and immediately abort - should handle cleanly
        console.log("  ⏱️ Testing abort during pending operation...");
        const signal = createTestSignal("timeout-1");
        // Start PREPARE but don't await
        const preparePromise = client.sendPrepare(signal);
        // Immediately try to abort
        await sleep(10);
        await client.sendAbort(signal.signal_id);
        // Wait for PREPARE to complete (it might succeed or fail, both are OK)
        try {
            await preparePromise;
        }
        catch {
            // Expected - PREPARE might fail after abort
        }
        // Verify client is still functional
        console.log("  📤 Verifying client still functional...");
        const signal2 = createTestSignal("timeout-2");
        const result = await client.sendPrepare(signal2);
        await client.sendAbort(signal2.signal_id);
        await client.disconnect();
        return {
            name: "Timeout",
            passed: true,
            duration: Date.now() - startTime,
            details: `Client remained functional after abort, PREPARE returned: ${result.prepared}`,
        };
    }
    catch (error) {
        await client.disconnect().catch(() => { });
        return {
            name: "Timeout",
            passed: false,
            duration: Date.now() - startTime,
            details: `Error: ${error.message}`,
        };
    }
}
/**
 * Test 4: Connection to Non-Existent Socket
 * Verifies graceful handling when execution engine is not running
 */
async function testNoServer() {
    const startTime = Date.now();
    const client = new FastPathClient({
        source: "brain",
        socketPath: "/tmp/nonexistent-socket.sock",
        hmacSecret: config.hmacSecret,
        connectionTimeout: 2000,
    });
    try {
        console.log("  🔌 Attempting connection to non-existent socket...");
        await client.connect();
        // If we get here, something is wrong
        await client.disconnect();
        return {
            name: "No Server",
            passed: false,
            duration: Date.now() - startTime,
            details: "Connection should have failed but succeeded",
        };
    }
    catch (error) {
        // Expected behavior - connection should fail gracefully
        return {
            name: "No Server",
            passed: true,
            duration: Date.now() - startTime,
            details: `Correctly failed with: ${error.message}`,
        };
    }
}
// Helper functions
function createTestSignal(id) {
    return {
        signal_id: `chaos-${id}-${Date.now()}`,
        source: "brain",
        symbol: "BTCUSDT",
        direction: "LONG",
        entry_zone: { min: 50000, max: 50100 },
        stop_loss: 49500,
        take_profits: [50500],
        confidence: 0.8,
        leverage: 1,
        timestamp: Date.now(),
    };
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// Main test runner
async function main() {
    const testName = process.argv[2] || "all";
    console.log("🔥 Titan Chaos Engineering Tests");
    console.log("=================================");
    console.log(`Socket: ${config.socketPath}`);
    console.log("");
    const tests = {
        reconnect: testReconnection,
        burst: testBurst,
        timeout: testTimeout,
        noserver: testNoServer,
    };
    const results = [];
    if (testName === "all") {
        for (const [name, testFn] of Object.entries(tests)) {
            console.log(`\n🧪 Running: ${name}`);
            const result = await testFn();
            results.push(result);
            console.log(`  ${result.passed ? "✅" : "❌"} ${result.name}: ${result.details}`);
        }
    }
    else if (tests[testName]) {
        console.log(`\n🧪 Running: ${testName}`);
        const result = await tests[testName]();
        results.push(result);
        console.log(`  ${result.passed ? "✅" : "❌"} ${result.name}: ${result.details}`);
    }
    else {
        console.error(`Unknown test: ${testName}`);
        console.log("Available tests:", Object.keys(tests).join(", "), "all");
        process.exit(1);
    }
    // Summary
    console.log("\n");
    console.log("📊 Summary");
    console.log("=================================");
    const passed = results.filter((r) => r.passed).length;
    const total = results.length;
    console.log(`Passed: ${passed}/${total}`);
    for (const result of results) {
        console.log(`  ${result.passed ? "✅" : "❌"} ${result.name} (${result.duration}ms)`);
    }
    const allPassed = passed === total;
    console.log("");
    console.log(allPassed ? "🎉 All tests passed!" : "💥 Some tests failed");
    process.exit(allPassed ? 0 : 1);
}
main().catch(console.error);
//# sourceMappingURL=chaos-tests.js.map