import type { ExecutionResult, Order, OrderResult } from "../types/orders.js";
import type { IOrderExecutor } from "./interfaces.js";

/**
 * Atomic Execution Configuration
 */
export interface AtomicConfig {
    /** Maximum time difference between legs in ms */
    maxTimeDiff: number;
    /** Whether to revert first leg if second fails (best effort) */
    revertOnFailure: boolean;
}

const DEFAULT_ATOMIC_CONFIG: AtomicConfig = {
    maxTimeDiff: 1000,
    revertOnFailure: true,
};

/**
 * Executor for atomic multi-leg trades (e.g., Basis trade: Buy Spot + Sell Perp)
 * Attempts to execute both legs as close as possible.
 */
export class AtomicExecutor {
    private executor: IOrderExecutor;
    private config: AtomicConfig;

    constructor(
        executor: IOrderExecutor,
        config: AtomicConfig = DEFAULT_ATOMIC_CONFIG,
    ) {
        this.executor = executor;
        this.config = config;
    }

    /**
     * Execute two legs atomically (pseudo-atomic)
     */
    async executeDualLeg(leg1: Order, leg2: Order): Promise<ExecutionResult> {
        const result: ExecutionResult = {
            success: false,
            totalCost: 0,
            effectiveBasis: 0,
            aborted: false,
        };

        try {
            // Execute simultaneously
            // In a real high-freq system, we'd want low-level control,
            // but here `Promise.all` gives mostly parallel dispatch
            const p1 = this.executor.executeOrder(leg1);
            const p2 = this.executor.executeOrder(leg2);

            const [r1, r2] = await Promise.allSettled([p1, p2]);

            // Process Leg 1
            if (r1.status === "fulfilled") {
                result.spotResult = r1.value;
            }

            // Process Leg 2
            if (r2.status === "fulfilled") {
                result.perpResult = r2.value;
            }

            // Check success
            if (result.spotResult && result.perpResult) {
                // Both succeeded
                // Check partial fills
                if (
                    result.spotResult.status === "FILLED" &&
                    result.perpResult.status === "FILLED"
                ) {
                    result.success = true;
                    // Calculate basis
                    const spotPrice = result.spotResult.avgPrice;
                    const perpPrice = result.perpResult.avgPrice;
                    if (spotPrice > 0) {
                        result.effectiveBasis = (perpPrice - spotPrice) /
                            spotPrice;
                    }
                } else {
                    // Partial fills - success is false, but we have fills
                    result.success = false; // Strictly atomic typically requires full fill
                    result.reason = "Partial fill";
                }
            } else {
                // One or both failed
                result.success = false;
                result.reason = "One or both legs failed";

                // Revert logic (if one succeeded and other failed)
                if (this.config.revertOnFailure) {
                    await this.handleRevert(result, leg1, leg2);
                }
            }

            // Calculate costs
            if (result.spotResult) result.totalCost += result.spotResult.fees;
            if (result.perpResult) result.totalCost += result.perpResult.fees;
        } catch (error: any) {
            result.success = false;
            result.reason = error.message;
        }

        return result;
    }

    private async handleRevert(
        result: ExecutionResult,
        leg1: Order,
        leg2: Order,
    ): Promise<void> {
        // If leg 1 succeeded but leg 2 failed, we revert leg 1
        if (result.spotResult?.status === "FILLED" && !result.perpResult) {
            // Revert leg 1
            const revertOrder: Order = {
                ...leg1,
                side: leg1.side === "BUY" ? "SELL" : "BUY",
                type: "MARKET", // Market close
                size: result.spotResult.filledSize,
            };
            try {
                await this.executor.executeOrder(revertOrder);
                // Mark as reverted in result (not strictly in interface but helpful)
                result.reason += " (Leg 1 Reverted)";
            } catch (e) {
                result.reason += " (Revert Failed)";
            }
        }

        // Symmetrical logic for leg 2 reverting
        if (result.perpResult?.status === "FILLED" && !result.spotResult) {
            const revertOrder: Order = {
                ...leg2,
                side: leg2.side === "BUY" ? "SELL" : "BUY",
                type: "MARKET",
                size: result.perpResult.filledSize,
            };
            try {
                await this.executor.executeOrder(revertOrder);
                result.reason += " (Leg 2 Reverted)";
            } catch (e) {
                result.reason += " (Revert Failed)";
            }
        }
    }
}
