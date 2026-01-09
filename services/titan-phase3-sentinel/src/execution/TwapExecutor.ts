import { EventEmitter } from "events";
import type {
    ClipResult,
    Order,
    OrderResult,
    TwapConfig,
    TwapResult,
} from "../types/orders.js";
import type { IOrderExecutor, TwapRequest } from "./interfaces.js";

/**
 * TWAP Executor
 * Slices large orders into smaller clips over time to minimize market impact.
 */
export class TwapExecutor extends EventEmitter {
    private executor: IOrderExecutor;
    private config: TwapConfig;
    private isRunning: boolean = false;
    private abortController: AbortController | null = null;

    constructor(
        executor: IOrderExecutor,
        config?: TwapConfig,
    ) {
        super();
        this.executor = executor;
        this.config = config || {
            maxClipSize: 500,
            minInterval: 30000,
            maxInterval: 90000,
            maxSlippage: 0.002,
        };
    }

    /**
     * Execute a TWAP order
     */
    async execute(request: TwapRequest): Promise<TwapResult> {
        if (this.isRunning) {
            throw new Error("TWAP execution already in progress");
        }

        this.isRunning = true;
        this.abortController = new AbortController();
        const result: TwapResult = {
            totalFilled: 0,
            avgPrice: 0,
            totalFees: 0,
            clips: [],
            aborted: false,
        };

        try {
            const clips = this.calculateClips(request);

            for (let i = 0; i < clips.length; i++) {
                if (this.abortController.signal.aborted) {
                    result.aborted = true;
                    result.reason = "Aborted by user";
                    break;
                }

                const clipSize = clips[i];

                // Execute clip
                const clipResult = await this.executeClip(
                    request.symbol,
                    request.side,
                    clipSize,
                    i + 1,
                );

                // Update result
                this.updateResult(result, clipResult);

                // Wait for next interval if not last clip
                if (i < clips.length - 1) {
                    const delay = this.calculateDelay(
                        request.duration,
                        clips.length,
                    );
                    await this.wait(delay, this.abortController.signal);
                }
            }
        } catch (error: any) {
            result.aborted = true;
            result.reason = error.message;
        } finally {
            this.isRunning = false;
            this.abortController = null;
        }

        return result;
    }

    /**
     * Abort current execution
     */
    abort(): void {
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    /**
     * Calculate clip sizes
     */
    private calculateClips(request: TwapRequest): number[] {
        const avgClipSize = Math.min(
            request.totalSize,
            this.config.maxClipSize,
        );
        const numClips = Math.ceil(request.totalSize / avgClipSize);

        const clips: number[] = [];
        let scheduledTotal = 0;
        const perClip = request.totalSize / numClips;

        for (let i = 0; i < numClips - 1; i++) {
            clips.push(perClip);
            scheduledTotal += perClip;
        }
        // Last clip takes remainder to ensure exact total match
        clips.push(request.totalSize - scheduledTotal);

        return clips;
    }

    /**
     * Calculate delay between clips
     */
    private calculateDelay(totalDuration: number, numClips: number): number {
        if (numClips <= 1) return 0;

        const avgInterval = totalDuration / (numClips - 1);

        // Clamp to config limits
        return Math.max(
            this.config.minInterval,
            Math.min(this.config.maxInterval, avgInterval),
        );
    }

    /**
     * Execute a single clip
     */
    private async executeClip(
        symbol: string,
        side: "BUY" | "SELL",
        size: number,
        clipNumber: number,
    ): Promise<ClipResult> {
        // 1. Check Slippage
        const currentPrice = await this.executor.getPrice(symbol);
        // Note: Assuming we want to execute at market, but protect against bad prices
        // In a real system we might set a limit price based on currentPrice * (1 +/- maxSlippage)

        const order: Order = {
            symbol,
            side,
            type: "MARKET",
            size,
        };

        const orderResult = await this.executor.executeOrder(order);

        // Calculate actual slippage
        const slippage = Math.abs(
            (orderResult.avgPrice - currentPrice) / currentPrice,
        );

        if (slippage > this.config.maxSlippage) {
            // We could abort here, or just log it.
            // For Sentinel, we might want to abort if slippage is too high repeatedly.
            // For this clip, it's already executed (MARKET), so we just report it.
            // Unless we used LIMIT orders with FOK.
        }

        return {
            clipNumber,
            size: orderResult.filledSize,
            price: orderResult.avgPrice,
            slippage,
            timestamp: Date.now(),
        };
    }

    /**
     * Update running result
     */
    private updateResult(result: TwapResult, clip: ClipResult): void {
        const totalValue = result.totalFilled * result.avgPrice +
            clip.size * clip.price;
        result.totalFilled += clip.size;
        result.avgPrice = result.totalFilled > 0
            ? totalValue / result.totalFilled
            : 0;
        result.clips.push(clip);
    }

    /**
     * Wait for delay with abort support
     */
    private wait(ms: number, signal: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            if (signal.aborted) {
                return reject(new Error("Aborted"));
            }

            const timeout = setTimeout(() => {
                resolve();
            }, ms);

            signal.addEventListener("abort", () => {
                clearTimeout(timeout);
                reject(new Error("Aborted"));
            });
        });
    }
}
