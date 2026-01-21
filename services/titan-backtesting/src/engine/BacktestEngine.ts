import { Logger } from "@titan/shared";
import { HistoricalDataService } from "../data/HistoricalDataService.js";
import { ShippingGate } from "../gate/ShippingGate.js";
import {
    BacktestResult,
    OHLCV,
    Strategy,
    Trade,
    ValidationReport,
} from "../types/index.js";
import { LatencyModel } from "./LatencyModel.js";

export interface BacktestConfig {
    symbol: string;
    timeframe: string;
    start: number;
    end: number;
    initialCapital: number;
}

export class BacktestEngine {
    private dataService: HistoricalDataService;
    private gate: ShippingGate;
    private logger: Logger;

    constructor(
        dataService: HistoricalDataService,
        gate: ShippingGate,
        logger: Logger,
    ) {
        this.dataService = dataService;
        this.gate = gate;
        this.logger = logger;
    }

    /**
     * Orchestrates a Walk-Forward Analysis
     */
    async runWalkForward(
        strategy: any, // Typed as 'Strategy' in real impl
        config: BacktestConfig,
        folds: number = 5,
    ): Promise<ValidationReport> {
        this.logger.info(`Starting Walk-Forward Analysis: ${folds} folds`);

        const totalDuration = config.end - config.start;
        const foldDuration = Math.floor(totalDuration / folds);

        let aggregatePnL = 0;
        let maxDD = 0;

        for (let i = 0; i < folds; i++) {
            const foldStart = config.start + (i * foldDuration);
            const foldEnd = foldStart + foldDuration;
            const trainEnd = foldStart + Math.floor(foldDuration * 0.7); // 70% Train

            // 1. Train (In-Sample) - Optimize parameters
            // In a real implementation, we would pass a 'train()' method here
            // await strategy.optimize(foldStart, trainEnd);

            // 2. Test (Out-Sample) - Verify
            const result = await this.runSimulation(strategy, {
                ...config,
                start: trainEnd,
                end: foldEnd,
            });

            aggregatePnL += result.totalPnL;
            maxDD = Math.max(maxDD, result.maxDrawdownPercent);

            this.logger.info(
                `Fold ${i + 1}/${folds} Result: PnL=${
                    result.totalPnL.toFixed(2)
                }, DD=${result.maxDrawdownPercent.toFixed(2)}`,
            );
        }

        // Construct Aggregate Result
        const finalResult: BacktestResult = {
            totalPnL: aggregatePnL,
            maxDrawdownPercent: maxDD,
            // ... calculate standard aggregation for other metrics
            totalTrades: 0,
            winRate: 0,
            maxDrawdown: 0,
            profitFactor: 0,
            calmarRatio: 0,
            sharpeRatio: 0,
            sortinoRatio: 0,
        };

        // Evaluate against baseline (Placeholder: Baseline is 0 for new strategy)
        const baseline: BacktestResult = {
            ...finalResult,
            totalPnL: 0,
            maxDrawdownPercent: 1.0,
        }; // Dummy baseline

        return this.gate.evaluate(baseline, finalResult);
    }

    private async runSimulation(
        strategy: Strategy,
        config: BacktestConfig,
    ): Promise<BacktestResult> {
        const candles = await this.dataService.getCandles(
            config.symbol,
            config.timeframe,
            config.start,
            config.end,
        );

        let equity = config.initialCapital;
        const trades: Trade[] = [];
        let openTrade: Trade | null = null;
        let peakEquity = equity;
        let maxDD = 0;

        const latencyModel = new LatencyModel();

        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];

            // 1. Check Exit
            if (openTrade) {
                // Simplified SL/TP
                const sl = openTrade.entryPrice * 0.95;
                const tp = openTrade.entryPrice * 1.10;
                let exitPrice: number | null = null;
                let exitReason = "";

                if (candle.low <= sl) {
                    exitPrice = sl;
                    exitReason = "STOP_LOSS";
                } else if (candle.high >= tp) {
                    exitPrice = tp;
                    exitReason = "TAKE_PROFIT";
                }

                if (exitPrice) {
                    const pnlPercent = (exitPrice - openTrade.entryPrice) /
                        openTrade.entryPrice;
                    const pnl = openTrade.quantity * openTrade.entryPrice *
                        pnlPercent;

                    openTrade.exitPrice = exitPrice;
                    openTrade.exitReason = exitReason;
                    openTrade.pnl = pnl;
                    openTrade.pnlPercent = pnlPercent;
                    openTrade.duration = candle.timestamp - openTrade.timestamp;

                    equity += pnl;
                    trades.push(openTrade);
                    openTrade = null;
                }
            }

            // 2. Entry
            if (!openTrade) {
                const signal = await strategy.onCandle(candle);
                if (signal && signal.action !== "HOLD") {
                    const idealPrice = candle.close;
                    const executionPrice = latencyModel.applyLatencyPenalty(
                        idealPrice,
                        candles,
                        candle.timestamp,
                    );
                    const atr = candle.high - candle.low;
                    const slippage = latencyModel.calculateSlippage(
                        10000,
                        atr,
                        1,
                    );

                    const finalPrice = signal.action === "BUY"
                        ? executionPrice + slippage
                        : executionPrice - slippage;
                    const fee = finalPrice * 0.0005; // 0.05%

                    const quantity = (equity * 0.10) / finalPrice;

                    openTrade = {
                        id: `trade-${i}`,
                        timestamp: candle.timestamp,
                        symbol: config.symbol,
                        side: signal.action === "BUY" ? "long" : "short",
                        entryPrice: finalPrice,
                        exitPrice: 0,
                        quantity,
                        leverage: 1,
                        pnl: 0,
                        pnlPercent: 0,
                        duration: 0,
                        slippage,
                        fees: fee,
                        exitReason: "",
                    };
                    equity -= fee;
                }
            }

            peakEquity = Math.max(peakEquity, equity);
            maxDD = Math.max(maxDD, (peakEquity - equity) / peakEquity);
        }

        const winningTrades = trades.filter((t) => t.pnl > 0);
        const losingTrades = trades.filter((t) => t.pnl <= 0);

        return {
            totalPnL: equity - config.initialCapital,
            maxDrawdownPercent: maxDD,
            totalTrades: trades.length,
            winRate: trades.length > 0
                ? winningTrades.length / trades.length
                : 0,
            maxDrawdown: peakEquity * maxDD,
            profitFactor: losingTrades.length > 0
                ? trades.filter((t) => t.pnl > 0).reduce(
                    (s, t) => s + t.pnl,
                    0,
                ) / Math.abs(
                    trades.filter((t) => t.pnl < 0).reduce((s, t) =>
                        s + t.pnl, 0),
                )
                : 999,
            calmarRatio: 0,
            sharpeRatio: 0,
            sortinoRatio: 0,
        };
    }
}
