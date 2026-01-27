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
export {};
//# sourceMappingURL=chaos-tests.d.ts.map