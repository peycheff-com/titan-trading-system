import { AccountingService } from "@/services/accounting/AccountingService";
import { FillsRepository } from "@/db/repositories/FillsRepository";
import { LedgerRepository } from "@/db/repositories/LedgerRepository";
import { FillReport, IntentSignal, NatsClient } from "@titan/shared";
import { Logger } from "@/logging/Logger";

// Mock Logger
jest.mock("@/logging/Logger");
(Logger.getInstance as jest.Mock).mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
});

describe("AccountingService Reconciliation", () => {
    let mockNats: NatsClient;
    let mockFillsRepo: FillsRepository;
    let mockLedgerRepo: LedgerRepository;
    let service: AccountingService;

    beforeEach(() => {
        mockNats = {
            subscribe: jest.fn(),
            publish: jest.fn(),
        } as unknown as NatsClient;

        mockFillsRepo = {
            createFill: jest.fn(),
        } as unknown as FillsRepository;

        mockLedgerRepo = {
            transactionExists: jest.fn().mockResolvedValue(false),
            createTransaction: jest.fn(),
        } as unknown as LedgerRepository;

        service = new AccountingService(
            mockFillsRepo,
            mockLedgerRepo,
            mockNats,
        );
    });

    it("should detect Drift (Price Difference)", async () => {
        const serviceAny = service as any;
        const signalId = "sig-123";
        const symbol = "BTC/USD";

        // 1. Track Intent
        serviceAny.trackIntent({
            signal_id: signalId,
            symbol,
            side: "BUY",
            price: 50000,
            qty: 1,
        } as unknown as IntentSignal);

        // 2. Process Shadow Fill
        serviceAny.processShadowFill({
            fill_id: "shadow-1",
            signal_id: signalId,
            symbol,
            price: 50000,
            qty: 1,
            timestamp: Date.now(),
        } as unknown as FillReport);

        // 3. Process Real Fill with Drift
        await serviceAny.processFill({
            fill_id: "real-1",
            signal_id: signalId,
            symbol,
            price: 50100, // 0.2% drift
            qty: 1,
            timestamp: Date.now(),
            t_signal: Date.now() - 100,
            t_ingress: Date.now() - 50,
            t_exchange: Date.now() - 10,
        } as unknown as FillReport);

        expect(mockNats.publish).toHaveBeenCalledWith(
            "titan.evt.alert.drift.v1",
            expect.objectContaining({
                type: "PRICE_DRIFT",
                signalId,
                driftPct: expect.any(Number),
            }),
        );
    });

    it("should alert on High Latency", async () => {
        const serviceAny = service as any;
        const signalId = "sig-lat-123";

        serviceAny.trackIntent({
            signal_id: signalId,
            symbol: "ETH/USD",
        } as unknown as IntentSignal);

        const now = Date.now();
        await serviceAny.processFill({
            fill_id: "real-lat-1",
            signal_id: signalId,
            price: 3000,
            qty: 1,
            timestamp: now,
            t_signal: now - 300, // 300ms latency
            t_ingress: now - 200,
            t_exchange: now - 100,
        } as unknown as FillReport);

        expect(mockNats.publish).toHaveBeenCalledWith(
            "titan.evt.alert.latency.v1",
            expect.objectContaining({
                type: "HIGH_LATENCY",
                signalId,
            }),
        );
    });
});
