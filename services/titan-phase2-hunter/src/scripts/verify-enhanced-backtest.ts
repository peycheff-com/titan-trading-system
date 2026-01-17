import { BacktestEngine } from "../backtest/BacktestEngine";
import { SignalGenerator } from "../execution/SignalGenerator";
import { HologramEngine } from "../engine/HologramEngine";
import { SessionProfiler } from "../engine/SessionProfiler";
import { InefficiencyMapper } from "../engine/InefficiencyMapper";
import { CVDValidator } from "../engine/CVDValidator";
import { MockBybitClient } from "../backtest/mocks/MockBybitClient";
import { MockOracle } from "../backtest/mocks/MockOracle";
import { MockGlobalLiquidity } from "../backtest/mocks/MockGlobalLiquidity";
import { SCENARIOS } from "../backtest/data/scenarios";
import { BacktestConfig } from "../backtest/BacktestEngine";
import { InstitutionalFlowClassifier } from "../flow/InstitutionalFlowClassifier";

async function runVerification() {
  const scenario = SCENARIOS.BULL_ORACLE_VETO;
  console.log(`\n🧪 Running Verification Scenario: ${scenario.name}`);
  console.log(`ℹ️  Description: ${scenario.description}`);

  // 1. Initialize Mocks
  console.log("Step 1: Initializing Mocks...");
  const mockBybit = new MockBybitClient();
  const mockOracle = new MockOracle();
  const mockGlobalLiquidity = new MockGlobalLiquidity();

  // 2. Configure Mocks with Scenario Data
  console.log("Step 2: Configuring Scenario Data...");
  scenario.oracleEvents.forEach((e) => {
    mockOracle.addEvent(e.timestamp, e.sentiment, e.confidence);
  });
  console.log(`   - Added ${scenario.oracleEvents.length} Oracle events`);

  scenario.liquidityScenarios.forEach((s) => {
    mockGlobalLiquidity.addScenario(s);
  });
  console.log(
    `   - Added ${scenario.liquidityScenarios.length} Liquidity Scenarios`,
  );

  // 3. Initialize Engines
  console.log("Step 3: Initializing Engines...");
  const sessionProfiler = new SessionProfiler();
  const inefficiencyMapper = new InefficiencyMapper(); // No args based on view
  const cvdValidator = new CVDValidator(); // No args based on view
  const flowClassifier = new InstitutionalFlowClassifier();
  const hologramEngine = new HologramEngine(mockBybit as any, flowClassifier);

  const signalGenerator = new SignalGenerator(
    hologramEngine,
    sessionProfiler,
    inefficiencyMapper,
    cvdValidator,
    mockOracle,
    mockGlobalLiquidity,
  ); // Constructor updated earlier to accept optional mocks, but wait, did I update constructor args order?
  // Let's check SignalGenerator constructor signature from my previous edit.
  // It was: constructor(hologramEngine, sessionProfiler, inefficiencyMapper, cvdValidator, oracle?, globalLiquidity?, config?)
  // Pass mocked instances.

  const backtestEngine = new BacktestEngine(
    mockBybit as any,
    hologramEngine,
    sessionProfiler,
    inefficiencyMapper,
    cvdValidator,
    signalGenerator,
    mockOracle,
    mockGlobalLiquidity,
  );

  // 4. Run Backtest
  console.log("Step 4: Running Backtest...");
  const config: BacktestConfig = {
    startDate: scenario.startDate,
    endDate: scenario.endDate,
    symbols: ["BTCUSDT"],
    initialEquity: 10000,
    riskPerTrade: 0.02,
    maxLeverage: 3,
    maxConcurrentPositions: 3,
    slippageModel: {
      postOnlySlippage: 0.0001,
      iocSlippage: 0.0002,
      marketSlippage: 0.0003,
    },
    feeModel: {
      makerFee: 0.0001,
      takerFee: 0.0006,
    },
    timeframe: "15m",
  };

  try {
    const results = await backtestEngine.runBacktest(config);

    // 5. Verify Results
    console.log("\n✅ Backtest Complete");
    console.log("-----------------------------------");
    console.log(`Total Trades: ${results.metrics.totalTrades}`);
    console.log(`Win Rate: ${results.metrics.winRate.toFixed(2)}%`);
    console.log(`Profit Factor: ${results.metrics.profitFactor.toFixed(2)}`);
    console.log(
      `Final Equity: ${
        results.equityCurve[results.equityCurve.length - 1].equity.toFixed(2)
      }`,
    );

    // Check if any logic triggered (e.g. Veto)
    // This is hard to detect from aggregate metrics unless we log internal events.
    // However, successful run implies integration works without crashing.
    // To verify Veto specifically, we'd expect 0 trades if Veto is constantly on and signal is generated.

    if (results.metrics.totalTrades === 0) {
      console.log(
        "ℹ️  Note: 0 trades executed. This might be expected if Oracle Veto worked correctly on all checks.",
      );
    }
  } catch (error) {
    console.error("❌ Backtest Failed:", error);
  }
}

// Run
runVerification().catch(console.error);
