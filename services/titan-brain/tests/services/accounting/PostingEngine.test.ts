import { PostingEngine } from "../../../src/services/accounting/PostingEngine";
import { FillReport } from "@titan/shared";
import { LedgerDirection, LedgerEventType } from "../../../src/types/ledger";

describe("PostingEngine", () => {
    const mockFill: FillReport = {
        fill_id: "fill-123",
        execution_id: "exec-123",
        client_order_id: "cloid-123",
        signal_id: "sig-123",
        symbol: "BTC/USDT",
        account: "spot",
        side: "BUY",
        price: 50000,
        qty: 1.0,
        fee: 5.0,
        fee_currency: "USDT",
        t_signal: 1000,
        t_ingress: 1001,
        t_exchange: 1002,
        t_ack: 1003,
    } as FillReport; // Cast to ensure it matches even if I miss optional props

    it("should create correct ledger entries for a BUY fill", () => {
        const tx = PostingEngine.createFromFill(mockFill);

        expect(tx.event_type).toBe(LedgerEventType.TRADE_FILL);
        expect(tx.correlation_id).toBe("fill-123");
        expect(tx.entries).toHaveLength(4); // 2 for trade, 2 for fee

        // Trade Entries
        const inventoryEntry = tx.entries.find((e: any) =>
            e.account_name === "Inventory:BTC/USDT"
        );
        expect(inventoryEntry).toBeDefined();
        expect(inventoryEntry!.direction).toBe(LedgerDirection.DEBIT);
        expect(inventoryEntry!.amount).toBe(1.0); // Qty

        const cashEntry = tx.entries.find((e: any) =>
            e.account_name === "Cash:USDT" &&
            e.direction === LedgerDirection.CREDIT
        );
        expect(cashEntry).toBeDefined();
        expect(cashEntry!.amount).toBe(50000); // Cost
    });

    it("should create correct ledger entries for a SELL fill", () => {
        const sellFill = {
            ...mockFill,
            side: "SELL",
            fill_id: "fill-sell-123",
        } as FillReport;
        const tx = PostingEngine.createFromFill(sellFill);

        // Trade Entries
        const cashEntry = tx.entries.find((e: any) =>
            e.account_name === "Cash:USDT" &&
            e.direction === LedgerDirection.DEBIT
        );
        expect(cashEntry).toBeDefined();
        expect(cashEntry!.amount).toBe(50000); // Proceeds

        const inventoryEntry = tx.entries.find((e: any) =>
            e.account_name === "Inventory:BTC/USDT"
        );
        expect(inventoryEntry).toBeDefined();
        expect(inventoryEntry!.direction).toBe(LedgerDirection.CREDIT);
        expect(inventoryEntry!.amount).toBe(1.0); // Qty
    });

    it("should record fees correctly", () => {
        const tx = PostingEngine.createFromFill(mockFill);

        const feeExpenseEntry = tx.entries.find((e: any) =>
            e.account_name === "Expense:Fees"
        );
        expect(feeExpenseEntry).toBeDefined();
        expect(feeExpenseEntry!.direction).toBe(LedgerDirection.DEBIT);
        expect(feeExpenseEntry!.amount).toBe(5.0);

        const feeCashEntry = tx.entries.find((e: any) =>
            e.account_name === "Cash:USDT" &&
            e.direction === LedgerDirection.CREDIT && e.amount === 5.0
        );
        expect(feeCashEntry).toBeDefined();
    });

    it("should handle legacy camelCase properties if needed (fallback)", () => {
        const legacyFill = {
            ...mockFill,
            fillId: "legacy-fill",
            fill_id: undefined,
            executionId: "legacy-exec",
            execution_id: undefined,
        } as any;

        const tx = PostingEngine.createFromFill(legacyFill);
        expect(tx.correlation_id).toBe("legacy-fill");
    });
});
