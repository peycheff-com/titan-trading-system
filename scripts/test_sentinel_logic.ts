import { RiskManager } from "../services/titan-phase3-sentinel/src/risk/RiskManager";
import { VacuumMonitor } from "../services/titan-phase3-sentinel/src/vacuum/VacuumMonitor";
import {
    HealthReport,
    RiskLimits,
} from "../services/titan-phase3-sentinel/src/types/portfolio";
import { SignalGenerator } from "../services/titan-phase3-sentinel/src/engine/StatEngine";
import { OrderBook } from "../services/titan-phase3-sentinel/src/types/statistics";

// Mock Interfaces and Utils
const STARTUP_EQUITY = 10000;
const BASE_LEVERAGE = 5.0;

const mockRiskLimits: RiskLimits = {
    maxLeverage: BASE_LEVERAGE,
    maxDelta: 0.05,
    criticalDelta: 0.1,
    warningDrawdown: 0.05,
    criticalDrawdown: 0.1,
    dailyDrawdownLimit: 0.03,
};

const mockHealth: HealthReport = {
    nav: 10000,
    equity: 10000,
    delta: 50,
    marginUtilization: 0.2,
    riskStatus: "NORMAL",
    positions: [{
        symbol: "BTCUSDT",
        side: "LONG",
        avgEntryPrice: 50000,
        spotSize: 1, // $50k value
        spotEntry: 50000,
        perpSize: -1, // Hedged
        perpEntry: 50000,
        unrealizedPnl: 0,
    }],
    alerts: [],
};

// Mock Signal Generator
const mockSignalGenerator = {} as SignalGenerator;

// Run Verification
async function runTest() {
    console.log("Starting Sentinel Phase 3 Verification...");

    // --- Test 1: Dynamic Risk Manager ---
    const riskManager = new RiskManager(mockRiskLimits);
    console.log("\n[TEST 1] Dynamic Risk Calculation");

    // Scenario A: Normal Volatility, Good Liquidity
    let res = riskManager.evaluate(mockHealth, STARTUP_EQUITY, 0, 50, 80);
    console.log(
        `Scenario A (Vol: 50, Liq: 80): Violations=${res.violations.length}, Leverage=${res.leverage}`,
    );

    // Scenario B: Extreme Volatility (>80) -> Max Leverage should halve to 2.5
    // Current leverage is Roughly 10x ($100k notion / $10k equity)

    // Let's adjust position to be within Base Limit first (2x Lev)
    const safeHealth = {
        ...mockHealth,
        positions: [{
            ...mockHealth.positions[0],
            spotSize: 0.2,
            perpSize: -0.2,
        }],
    };

    res = riskManager.evaluate(safeHealth, STARTUP_EQUITY, 0, 50, 80);
    console.log(
        `Scenario Normal (2x Lev, Limit 5x): Passed=${res.withinLimits}`,
    );

    // Scenario C: Extreme Volatility (>80) -> Limit becomes 2.5x
    res = riskManager.evaluate(safeHealth, STARTUP_EQUITY, 0, 90, 80);
    console.log(
        `Scenario High Vol (2x Lev, Limit 2.5x): Passed=${res.withinLimits}`,
    );

    // Scenario D: Illiquid (<20) -> Limit becomes 2.5x
    res = riskManager.evaluate(safeHealth, STARTUP_EQUITY, 0, 50, 10);
    console.log(
        `Scenario Low Liq (2x Lev, Limit 2.5x): Passed=${res.withinLimits}`,
    );

    // Scenario E: BOTH High Vol + Low Liq -> Limit becomes 1.25x
    // 2x Leverage should FAIL here.
    res = riskManager.evaluate(safeHealth, STARTUP_EQUITY, 0, 90, 10);
    console.log(
        `Scenario Chaos (2x Lev, Limit 1.25x): Passed=${res.withinLimits}, Violations=${
            JSON.stringify(res.violations)
        }`,
    );

    // --- Test 2: Vacuum Monitor Liquidity Check ---
    console.log("\n[TEST 2] Vacuum Monitor Liquidity Check");
    const vacuum = new VacuumMonitor(mockSignalGenerator);

    const spotPrice = 50000;
    const perpPrice = 49000; // -2% basis (Vacuum!)

    // Empty/Thin Orderbook
    const thinBook: OrderBook = {
        bids: [[49900, 0.1]], // $5k depth
        asks: [[50100, 0.1]],
        timestamp: Date.now(),
    };

    let opp = await vacuum.checkForOpportunity(
        "BTCUSDT",
        spotPrice,
        perpPrice,
        thinBook,
    );
    console.log(
        `Opportunity with Thin Book: ${opp ? "FOUND" : "BLOCKED (Correct)"}`,
    );

    // Thick Orderbook
    const deepBook: OrderBook = {
        bids: [[49990, 2.0]], // $100k depth
        asks: [[50010, 2.0]],
        timestamp: Date.now(),
    };

    // Inject Liquidation Event to boost confidence > 0.6
    vacuum.onLiquidation({
        id: "liq-1",
        symbol: "BTCUSDT",
        side: "SELL",
        price: 49000,
        size: 5000,
        timestamp: Date.now(),
    });

    opp = await vacuum.checkForOpportunity(
        "BTCUSDT",
        spotPrice,
        perpPrice,
        deepBook,
    );
    console.log(
        `Opportunity with Deep Book: ${opp ? "FOUND (Correct)" : "BLOCKED"}`,
    );
}

runTest();
