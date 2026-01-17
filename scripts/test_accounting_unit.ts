import { AccountingService } from "../services/titan-brain/dist/services/accounting/AccountingService.js";
import { NatsClient } from "@titan/shared";
import { TreasuryRepository } from "../services/titan-brain/dist/db/repositories/TreasuryRepository.js";
import { Logger } from "../services/titan-brain/dist/logging/Logger.js";

// Mock Logger to avoid clutter
Logger.prototype.info = (msg, meta, data) =>
    console.log(`[INFO] ${msg}`, data || "");
Logger.prototype.warn = (msg, meta, data) =>
    console.log(`[WARN] ${msg}`, data || "");
Logger.prototype.error = (msg, meta, data) =>
    console.log(`[ERROR] ${msg}`, data || "");

// Mock NatsClient
const mockNats = {
    subscribe: async (subject: string, callback: any) => {
        console.log(`[MOCK] Subscribed to ${subject}`);
        // We will manually invoke callback later if needed, but for unit test we can just call methods directly
        // or register them to a map to call them.
        // For now, let's just store them.
        (mockNats as any).callbacks[subject] = callback;
    },
    callbacks: {} as Record<string, any>,
} as unknown as NatsClient;

// Mock TreasuryRepository
const mockTreasury = {
    addFill: async (fill: any) => {
        console.log(
            `[MOCK] TreasuryRepository.addFill called with:`,
            fill.fill_id,
        );
    },
} as unknown as TreasuryRepository;

async function test() {
    console.log("Starting Accounting Unit Test");

    const accountant = new AccountingService(mockTreasury, mockNats);
    await accountant.start();

    const signalId = "test-signal-1";

    // 1. Simulate Intent (Brain -> NATS)
    // Logic: accountant.trackIntent(...)
    // Usually triggered by NATS subscription. We can invoke the callback if we want, or call private method via public for test (or any access).
    // But trackIntent is private.
    // We should trigger the subscription callback.

    const intentCallback =
        (mockNats as any).callbacks["titan.execution.intent.>"]; // Might need exact match or regex
    if (intentCallback) {
        console.log("Simulating Intent Signal...");
        intentCallback({
            signal_id: signalId,
            symbol: "BTCUSDT",
            direction: "LONG",
            timestamp: Date.now(),
        }, "titan.execution.intent.BTCUSDT");
    } else {
        console.error("Intent subscription NOT found!");
    }

    // 2. Simulate Fill (Execution -> NATS)
    const fillCallback = (mockNats as any).callbacks["titan.execution.fill.>"];
    if (fillCallback) {
        console.log("Simulating Fill Message...");
        await fillCallback({
            fill_id: "fill-123",
            signal_id: signalId,
            symbol: "BTCUSDT",
            side: "BUY",
            price: 90000,
            qty: 0.1,
            fee: 0.0001,
            fee_currency: "BNB",
            t_signal: Date.now() - 100,
            t_ingress: Date.now() - 50,
            t_exchange: Date.now() - 10,
        }, "titan.execution.fill.BTCUSDT");
    } else {
        console.error("Fill subscription NOT found!");
    }

    console.log("Test Complete");
}

test().catch(console.error);
