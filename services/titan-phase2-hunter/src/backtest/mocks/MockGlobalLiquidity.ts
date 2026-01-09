import { GlobalLiquidityAggregator } from "../../global-liquidity/GlobalLiquidityAggregator";
import {
    ConnectionStatus,
    GlobalCVDData,
    SignalValidationResponse,
} from "../../types";

export class MockGlobalLiquidity extends GlobalLiquidityAggregator {
    private mockCVD: GlobalCVDData | null = null;
    private validationOverride: SignalValidationResponse | null = null;
    private scenarios: Array<
        {
            timestamp: number;
            globalCVD: number[];
            manipulationDetected: boolean;
            consensus: boolean;
        }
    > = [];
    private currentTime: number = Date.now();

    constructor() {
        super({ enabled: true });
    }

    public setMockCVD(cvd: GlobalCVDData) {
        this.mockCVD = cvd;
    }

    public setValidationOverride(response: SignalValidationResponse) {
        this.validationOverride = response;
    }

    public addScenario(
        scenario: {
            timestamp: number;
            globalCVD: number[];
            manipulationDetected: boolean;
            consensus: boolean;
        },
    ) {
        this.scenarios.push(scenario);
    }

    public updateState(timestamp: number) {
        this.currentTime = timestamp;
        // Check for active scenario
        const activeScenario = this.scenarios.find((s) =>
            s.timestamp <= this.currentTime &&
            s.timestamp > this.currentTime - (60 * 60 * 1000) // 1 hour window
        );

        if (activeScenario) {
            this.mockCVD = {
                aggregatedCVD: activeScenario
                    .globalCVD[activeScenario.globalCVD.length - 1],
                exchangeFlows: [],
                consensus: activeScenario.consensus
                    ? (activeScenario
                            .globalCVD[activeScenario.globalCVD.length - 1] > 0
                        ? "bullish"
                        : "bearish")
                    : "neutral",
                confidence: 80,
                manipulation: {
                    detected: activeScenario.manipulationDetected,
                    suspectExchange: activeScenario.manipulationDetected
                        ? "binance"
                        : null,
                    divergenceScore: activeScenario.manipulationDetected
                        ? 90
                        : 10,
                    pattern: activeScenario.manipulationDetected
                        ? "single_exchange_outlier"
                        : "none",
                },
                timestamp: new Date(this.currentTime),
            };
        }
    }

    public getGlobalCVD(symbol: string): GlobalCVDData | null {
        return this.mockCVD;
    }

    public validateSignal(
        symbol: string,
        direction: "LONG" | "SHORT",
        technicalConfidence: number,
    ): SignalValidationResponse | null {
        if (this.validationOverride) {
            return this.validationOverride;
        }

        if (this.mockCVD) {
            // Simple mock logic
            const isAligned = (direction === "LONG" &&
                this.mockCVD.consensus === "bullish") ||
                (direction === "SHORT" && this.mockCVD.consensus === "bearish");

            const consensusDir = this.mockCVD.consensus === "conflicted"
                ? "neutral"
                : this.mockCVD.consensus;

            return {
                isValid: isAligned,
                adjustedConfidence: isAligned
                    ? technicalConfidence + 10
                    : technicalConfidence - 20,
                consensusResult: {
                    isValid: isAligned,
                    hasConsensus: true,
                    consensusDirection: consensusDir,
                    confidence: this.mockCVD.confidence,
                    votes: [],
                    agreementRatio: 1,
                    connectedExchanges: 3,
                    reasoning: ["Mock Validation"],
                    timestamp: new Date(this.currentTime),
                },
                recommendation: isAligned ? "proceed" : "veto",
                reasoning: ["Mock Validation Logic"],
            };
        }

        return null;
    }

    public async initialize(): Promise<void> {
        console.log("✅ Mock Global Liquidity Aggregator initialized");
        // No-op for real connections
    }
}
