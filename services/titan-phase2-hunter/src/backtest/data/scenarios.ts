/**
 * Backtest Scenarios for Titan Phase 2 - The Hunter (2026 Enhanced)
 */

export interface OracleEvent {
    timestamp: number;
    sentiment: number; // -100 to 100
    confidence: number; // 0 to 100
}

export interface LiquidityScenario {
    timestamp: number;
    globalCVD: number[]; // Time-series of Global CVD values
    manipulationDetected: boolean;
    consensus: boolean;
}

export interface TestScenario {
    id: string;
    name: string;
    description: string;
    startDate: number;
    endDate: number;
    oracleEvents: OracleEvent[];
    liquidityScenarios: LiquidityScenario[];
}

const NOW = Date.now();
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

export const SCENARIOS: Record<string, TestScenario> = {
    // Scenario 1: Bull Market with Oracle Support
    // Expectation: High win rate, larger position sizes due to conviction
    BULL_ORACLE_SUPPORT: {
        id: "BULL_ORACLE_SUPPORT",
        name: "Bull Market with Oracle Support",
        description:
            "Price is trending up, and Oracle sentiment is consistently bullish.",
        startDate: NOW - (7 * ONE_DAY),
        endDate: NOW,
        oracleEvents: [
            { timestamp: NOW - (7 * ONE_DAY), sentiment: 80, confidence: 90 },
            { timestamp: NOW - (5 * ONE_DAY), sentiment: 85, confidence: 95 },
            { timestamp: NOW - (3 * ONE_DAY), sentiment: 75, confidence: 85 },
            { timestamp: NOW - (1 * ONE_DAY), sentiment: 90, confidence: 90 },
        ],
        liquidityScenarios: [],
    },

    // Scenario 2: Bull Market with Oracle Veto
    // Expectation: Signals should be vetoed or reduced size, avoiding losses if price reverses
    BULL_ORACLE_VETO: {
        id: "BULL_ORACLE_VETO",
        name: "Bull Market with Oracle Veto",
        description:
            "Price is trending up, but Oracle sentiment is bearish (divergence/reversal warning).",
        startDate: NOW - (7 * ONE_DAY),
        endDate: NOW,
        oracleEvents: [
            { timestamp: NOW - (7 * ONE_DAY), sentiment: -60, confidence: 80 },
            { timestamp: NOW - (5 * ONE_DAY), sentiment: -70, confidence: 85 },
            { timestamp: NOW - (3 * ONE_DAY), sentiment: -80, confidence: 90 },
            { timestamp: NOW - (1 * ONE_DAY), sentiment: -90, confidence: 95 },
        ],
        liquidityScenarios: [],
    },

    // Scenario 3: Global CVD Manipulation
    // Expectation: Signals should be vetoed due to manipulation detection
    MANIPULATION_VETO: {
        id: "MANIPULATION_VETO",
        name: "Global CVD Manipulation Veto",
        description:
            "Price moves up but Global CVD diverges significantly (manipulation).",
        startDate: NOW - (1 * ONE_DAY),
        endDate: NOW,
        oracleEvents: [],
        liquidityScenarios: [
            {
                timestamp: NOW - (12 * ONE_HOUR), // During trading session
                globalCVD: [1000, 500, 0, -500, -1000], // CVD dumping while price might be rising
                manipulationDetected: true,
                consensus: false,
            },
        ],
    },
};
