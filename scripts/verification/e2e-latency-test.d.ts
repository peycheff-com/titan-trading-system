#!/usr/bin/env node
/**
 * End-to-End Latency Test
 *
 * Measures round-trip latency through the entire Titan system:
 * Signal Generation -> IPC -> Execution Engine -> Order Execution
 *
 * Usage:
 *   node scripts/verification/e2e-latency-test.js
 *
 * Environment Variables:
 *   TITAN_IPC_SOCKET     - Path to IPC socket (default: /tmp/titan-ipc.sock)
 *   TITAN_HMAC_SECRET    - HMAC secret for signing (default: titan-hmac-secret)
 *   NATS_URL             - NATS server URL (default: nats://localhost:4222)
 *   TEST_ITERATIONS      - Number of test iterations (default: 100)
 */
export {};
//# sourceMappingURL=e2e-latency-test.d.ts.map