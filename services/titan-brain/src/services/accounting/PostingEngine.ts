import {
    CreateLedgerTransactionDTO,
    LedgerDirection,
    LedgerEventType,
} from "../../types/ledger.js";
import { FillReport } from "@titan/shared";

/**
 * The Posting Engine translates business events into double-entry accounting records.
 */
export class PostingEngine {
    /**
     * Create a Ledger Transaction from a Trade Fill
     */
    static createFromFill(fill: FillReport): CreateLedgerTransactionDTO {
        const entries = [];
        const cost = fill.price * fill.qty;
        const fee = fill.fee || 0;
        const feeCurrency = (fill as any).feeCurrency ||
            (fill as any).fee_currency ||
            "USDT"; // Default/Fallback
        const quoteCurrency = "USDT"; // Assumption for simplicity, should come from symbol decomposition

        // 1. Record the Trade (Asset Swaps)
        if (fill.side === "BUY") {
            // BUY: Debit Inventory (Asset), Credit Cash (Asset)
            entries.push({
                account_name: `Inventory:${fill.symbol}`,
                currency: fill.symbol.split("/")[0], // Base
                direction: LedgerDirection.DEBIT,
                amount: fill.qty,
            });
            entries.push({
                account_name: `Cash:${quoteCurrency}`,
                currency: quoteCurrency,
                direction: LedgerDirection.CREDIT,
                amount: cost,
            });
        } else {
            // SELL: Debit Cash (Asset), Credit Inventory (Asset)
            entries.push({
                account_name: `Cash:${quoteCurrency}`,
                currency: quoteCurrency,
                direction: LedgerDirection.DEBIT,
                amount: cost,
            });
            entries.push({
                account_name: `Inventory:${fill.symbol}`,
                currency: fill.symbol.split("/")[0],
                direction: LedgerDirection.CREDIT,
                amount: fill.qty,
            });
        }

        // 2. Record the Fee
        if (fee > 0) {
            // Debit Fee Expense, Credit Cash (or whatever asset was used)
            entries.push({
                account_name: `Expense:Fees`,
                currency: feeCurrency,
                direction: LedgerDirection.DEBIT,
                amount: fee,
            });
            entries.push({
                account_name: `Cash:${feeCurrency}`, // Assuming fee is paid from cash
                currency: feeCurrency,
                direction: LedgerDirection.CREDIT,
                amount: fee,
            });
        }

        // 3. PnL (Realized)
        // Note: The above logic handles "Inventory" movement.
        // Realized PnL is the difference between Cost Basis and Exit Price.
        // If fill.realizedPnL is present, we need to adjust Inventory/Equity.
        // Standard FIFO Accounting:
        // On Close: Dr Cash, Cr Inventory (at Cost Basis), Cr PnL (Difference).
        // Since we blindly Credits Inventory at Exit Price above, we might be over/under-crediting Inventory relative to its Cost Basis.
        // CORRECT APPROACH:
        // The "Inventory" account typically tracks Units, but in a monetary ledger it tracks "Books Value".
        // If we track "Units" in a separate system (Position Manager), the Ledger just tracks Cost.
        // For Simplification Phase 1: We use "Weighted Average" approach implied by "Credit Inventory at Exit Price" if we assume Inventory is revalued?
        // NO.
        // Let's stick to the simplest "Trading Sub-ledger" style for now which effectively acts as a cash-flow statement,
        // BUT if we get `realizedPnL` from execution, we can book it:
        // Adjust Inventory Valuation?
        // Let's assume the Execution Engine sends us `realizedPnL`.
        // If PnL > 0: Cr PnL (Revenue), Dr Cash is already there... wait.

        // Let's rely on the explicit PnL field if present.
        // If realizedPnL is present, it means we closed a position.
        // complexity: Modeling explicit generic accounting without cost-basis awareness in Brain is hard.
        // Strategy: Just record the Flows (Cash/Inventory moves) and the Fee.
        // The "Inventory" account will effectively act as a "Trading Account" that accumulates Cost and Proceeds.
        // Net of Inventory Account = Realized PnL + Unrealized PnL (Cost Basis).

        // To make it clearer, let's just stick to the Asset Swap logic + Fees for now.
        // The "Inventory" account balance will represent the net investment.

        return {
            correlation_id: fill.fill_id || (fill as any).fillId ||
                fill.execution_id || (fill as any).executionId ||
                (fill as any).id,
            event_type: LedgerEventType.TRADE_FILL,
            description:
                `${fill.side} ${fill.qty} ${fill.symbol} @ ${fill.price}`,
            entries,
            metadata: {
                signalId: fill.signal_id || (fill as any).signalId,
                venue: "Binance", // TODO: Extract from symbol or fill
            },
        };
    }
}
