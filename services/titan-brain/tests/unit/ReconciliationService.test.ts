import { ReconciliationService } from "../../src/reconciliation/ReconciliationService.js";
import { ExecutionEngineClient } from "../../src/server/index.js";
import { PositionManager } from "../../src/engine/PositionManager.js";
import { PositionRepository } from "../../src/db/repositories/PositionRepository.js";
import { TruthRepository } from "../../src/db/repositories/TruthRepository.js";
import { Position, ReconciliationConfig } from "../../src/types/index.js";
import { jest } from "@jest/globals";
import { Logger } from "@titan/shared";
import { createHash } from "crypto";

// Mock dependencies
const mockExecutionClient = {
    getPositions: jest.fn(),
    forwardSignal: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    fetchExchangePositions: jest.fn(),
} as unknown as ExecutionEngineClient;

const mockPositionManager = {
    getPositions: jest.fn(),
} as unknown as PositionManager;

const mockTruthRepository = {
    recordRun: jest.fn(),
    persistEvidence: jest.fn(),
    recordDrift: jest.fn(),
    updateConfidence: jest.fn(),
    updateRunStatus: jest.fn(),
    getConfidence: jest.fn(),
} as unknown as TruthRepository;

const config: ReconciliationConfig = {
    intervalMs: 1000,
    exchanges: ["BYBIT"],
};

describe("ReconciliationService", () => {
    let service: ReconciliationService;

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default mock returns
        (mockTruthRepository.recordRun as any).mockResolvedValue(1);
        (mockTruthRepository.getConfidence as any).mockResolvedValue(null);
        (mockTruthRepository.recordDrift as any).mockResolvedValue(undefined);
        (mockTruthRepository.updateConfidence as any).mockResolvedValue(
            undefined,
        );

        service = new ReconciliationService(
            config,
            mockExecutionClient,
            mockPositionManager,
            undefined, // posRepo
            undefined, // eventStore
            mockTruthRepository,
        );
    });

    it("should reconcile matching positions without drift", async () => {
        const brainPos: Position[] = [{
            symbol: "BTC-PERP",
            side: "LONG",
            size: 1.0,
            entryPrice: 50000,
            leverage: 1,
            unrealizedPnL: 0,
            phaseId: "phase1",
            exchange: "BYBIT",
        }];

        (mockPositionManager.getPositions as any).mockReturnValue(brainPos);
        (mockExecutionClient.fetchExchangePositions as any).mockResolvedValue([{
            symbol: "BTC-PERP",
            side: "LONG",
            size: 1.0,
            entryPrice: 50000,
            unrealizedPnL: 0,
            leverage: 1,
            marginType: "cross",
            timestamp: Date.now(),
        }]);

        await service.reconcile("BYBIT");

        expect(mockTruthRepository.recordDrift).not.toHaveBeenCalled();
        expect(mockTruthRepository.updateConfidence).toHaveBeenCalledWith(
            expect.objectContaining({
                score: 1.0,
                state: "HIGH",
            }),
        );
    });

    it("should detect GHOST_POSITION (exists in Brain, missing on Exchange)", async () => {
        const brainPos: Position[] = [{
            symbol: "ETH-PERP",
            side: "LONG",
            size: 10.0,
            entryPrice: 3000,
            leverage: 1,
            unrealizedPnL: 0,
            phaseId: "phase1",
            exchange: "BYBIT",
        }];

        // Set initial confidence somewhat lower so one hit degrades it
        (mockTruthRepository.getConfidence as any).mockResolvedValue({
            scope: "BYBIT",
            score: 0.9,
            state: "HIGH",
            reasons: [],
            lastUpdateTs: Date.now(),
        });

        (mockPositionManager.getPositions as any).mockReturnValue(brainPos);
        (mockExecutionClient.fetchExchangePositions as any).mockResolvedValue(
            [],
        ); // Empty exchange

        await service.reconcile("BYBIT");

        expect(mockTruthRepository.recordDrift).toHaveBeenCalledWith(
            expect.objectContaining({
                driftType: "GHOST_POSITION",
                severity: "CRITICAL",
            }),
        );

        // Score should decay 0.9 - 0.2 = 0.7 which is < 0.8 => DEGRADED
        expect(mockTruthRepository.updateConfidence).toHaveBeenCalledWith(
            expect.objectContaining({
                state: "DEGRADED",
            }),
        );
    });

    it("should detect SIZE_MISMATCH", async () => {
        const brainPos: Position[] = [{
            symbol: "SOL-PERP",
            side: "SHORT",
            size: 10.0, // Brain says 10
            entryPrice: 100,
            leverage: 1,
            unrealizedPnL: 0,
            phaseId: "phase1",
            exchange: "BYBIT",
        }];

        (mockPositionManager.getPositions as any).mockReturnValue(brainPos);
        (mockExecutionClient.fetchExchangePositions as any).mockResolvedValue([{
            symbol: "SOL-PERP",
            side: "SHORT",
            size: 5.0, // Exchange says 5
            entryPrice: 100,
            unrealizedPnL: 0,
            leverage: 1,
            marginType: "cross",
            timestamp: Date.now(),
        }]);

        await service.reconcile("BYBIT");

        expect(mockTruthRepository.recordDrift).toHaveBeenCalledWith(
            expect.objectContaining({
                driftType: "SIZE_MISMATCH",
                severity: "WARNING",
            }),
        );
    });
});
