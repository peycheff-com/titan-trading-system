import { RiskManager } from "../src/risk/RiskManager.js";
import { VacuumMonitor } from "../src/vacuum/VacuumMonitor.js";
async function verifyRiskManager() {
    console.log("\n--- Verifying Risk Manager Dynamic Leverage ---");
    const riskManager = new RiskManager({
        maxPositionSize: 100000,
        criticalDrawdown: 0.15,
        dailyDrawdownLimit: 0.05,
        maxLeverage: 10, // Base max leverage
        stopLossThreshold: 0.02,
        criticalDelta: 0.2,
        maxDelta: 0.1,
    });
    const health = {
        totalEquity: 10000,
        availableEquity: 10000,
        positions: [{ spotSize: 0.5, perpSize: -0.5, spotEntry: 50000 }], // $50k position (5x leverage)
        delta: 0,
        dailyPnL: 0,
    };
    // 1. Normal Conditions
    console.log("Test 1: Normal Conditions (Vol=20, Liq=100)");
    let status = riskManager.evaluate(health, 10000, 0, 20, 100);
    console.log(`Leverage: ${status.leverage.toFixed(2)}, Allowed: ${status.withinLimits}`);
    if (!status.withinLimits) {
        console.error("FAILED: Should be allowed in normal conditions");
    }
    // 2. High Volatility (Should cut max leverage to 5x)
    console.log("Test 2: High Volatility (Vol=90, Liq=100)");
    // Position is 5x. Max becomes 10 * 0.5 = 5x. Should be barely allowed or strict?
    // If leverage > effectiveMax, it fails. 5.0 > 5.0 is False, so it passes.
    // Let's increase position slightly to 5.1x to fail
    const healthRisky = {
        ...health,
        positions: [{ spotSize: 0.51, perpSize: -0.51, spotEntry: 50000 }],
    }; // $51k / 10k = 5.1x
    status = riskManager.evaluate(healthRisky, 10000, 0, 90, 100);
    console.log(`Leverage: 5.1, Limit Should be 5.0. Allowed: ${status.withinLimits}`);
    if (status.withinLimits) {
        console.error("FAILED: Should be blocked by High Volatility limit");
    }
    // 3. Low Liquidity (Should cut max leverage to 5x)
    console.log("Test 3: Low Liquidity (Vol=20, Liq=10)");
    status = riskManager.evaluate(healthRisky, 10000, 0, 20, 10);
    console.log(`Leverage: 5.1, Limit Should be 5.0. Allowed: ${status.withinLimits}`);
    if (status.withinLimits) {
        console.error("FAILED: Should be blocked by Low Liquidity limit");
    }
    // 4. Both Bad (Should cut max leverage to 2.5x)
    console.log("Test 4: High Vol + Low Liq (Vol=90, Liq=10)");
    const healthSmall = {
        ...health,
        positions: [{ spotSize: 0.3, perpSize: -0.3, spotEntry: 50000 }],
    }; // $30k / 10k = 3x
    status = riskManager.evaluate(healthSmall, 10000, 0, 90, 10);
    console.log(`Leverage: 3.0, Limit Should be 2.5 (10 * 0.5 * 0.5). Allowed: ${status.withinLimits}`);
    if (status.withinLimits) {
        console.error("FAILED: Should be blocked by combined limits");
    }
}
async function verifyVacuumMonitor() {
    console.log("\n--- Verifying Vacuum Monitor Liquidity Health ---");
    const mockSigGen = {};
    const monitor = new VacuumMonitor(mockSigGen);
    const spotPrice = 50000;
    // 1. Thick Order Book (> $50k depth)
    const thickBook = {
        bids: [[49990, 2.0]], // $100k roughly
        asks: [[50010, 2.0]],
        timestamp: Date.now(),
    };
    // Inject Liquidation Event to boost confidence > 0.6
    monitor.onLiquidation({
        symbol: "BTCUSDT",
        side: "SELL",
        exchange: "BINANCE",
        price: 49500,
        size: 2000, // > MIN_LIQUIDATION_SIZE (1000)
        timestamp: Date.now(),
    });
    const opp1 = await monitor.checkForOpportunity("BTCUSDT", spotPrice, spotPrice * 0.99, thickBook);
    console.log("Test 1: Thick Book (> $50k). Opportunity found:", opp1 !== null);
    if (opp1 === null) {
        console.error("FAILED: Should find opportunity with liquidations + thick book");
    }
    // Note: It returns null if basis condition isn't met, so we need to trigger basis too.
    // Basis = (49500 - 50000)/50000 = -0.01 (-1%). Should trigger if liquidity ok.
    // 2. Thin Order Book (< $50k depth)
    const thinBook = {
        bids: [[49990, 0.1]], // $5k
        asks: [[50010, 0.1]],
        timestamp: Date.now(),
    };
    // Trigger basis condition
    const opp2 = await monitor.checkForOpportunity("BTCUSDT", spotPrice, spotPrice * 0.99, thinBook);
    console.log("Test 2: Thin Book (< $50k). Opportunity found:", opp2 !== null);
    if (opp2 !== null) {
        console.error("FAILED: Should be blocked by Low Liquidity");
    }
}
async function run() {
    await verifyRiskManager();
    await verifyVacuumMonitor();
}
run().catch(console.error);
//# sourceMappingURL=verify_sentinel_phase3.js.map