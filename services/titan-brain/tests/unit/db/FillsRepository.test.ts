import { FillsRepository } from "../../../src/db/repositories/FillsRepository.js";
import { DatabaseManager } from "../../../src/db/DatabaseManager.js";
import { ExecutionReport } from "../../../src/types/index.js";

// Mock DatabaseManager
const mockQuery = jest.fn();
const mockDb = {
    query: mockQuery,
} as unknown as DatabaseManager;

describe("FillsRepository", () => {
    let repo: FillsRepository;

    beforeEach(() => {
        repo = new FillsRepository(mockDb);
        mockQuery.mockReset();
    });

    const mockFill: ExecutionReport = {
        type: "FILL",
        phaseId: "phase1",
        symbol: "BTC/USDT",
        side: "BUY",
        price: 50000,
        qty: 0.1,
        timestamp: 1640995200000,
        fillId: "fill-123",
        executionId: "exec-123",
        orderId: "order-123",
    };

    it("should generate correct SQL with ON CONFLICT clause for createFill", async () => {
        await repo.createFill(mockFill);

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const callArgs = mockQuery.mock.calls[0];
        const sql = callArgs[0] as string;
        const params = callArgs[1] as any[];

        // Check SQL structure
        expect(sql).toContain("INSERT INTO fills");
        expect(sql).toContain("ON CONFLICT (fill_id) DO UPDATE SET");
        expect(sql).toContain(
            "t_signal = COALESCE(fills.t_signal, EXCLUDED.t_signal)",
        );

        // Check Params
        expect(params[0]).toBe("fill-123"); // fill_id
        expect(params[2]).toBe("BTC/USDT"); // symbol
        expect(params[3]).toBe("BUY");
    });

    it("should skip persistence if no fillId/executionId is provided", async () => {
        const invalidFill = { ...mockFill };
        delete invalidFill.fillId;
        delete invalidFill.executionId;

        const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

        await repo.createFill(invalidFill);

        expect(mockQuery).not.toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining("Skipping fill persistence"),
            expect.anything(),
        );

        consoleSpy.mockRestore();
    });

    it("should use upstream executionId if fillId is missing", async () => {
        const execFill = { ...mockFill };
        delete execFill.fillId;
        execFill.executionId = "exec-only-123";

        await repo.createFill(execFill);

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const params = mockQuery.mock.calls[0][1] as any[];
        expect(params[0]).toBe("exec-only-123");
    });
});
