import { NatsClient } from "@titan/shared";
import {
  DefconLevel,
  GovernanceEngine,
  SystemHealth,
} from "../features/Governance/GovernanceEngine.js";
import { Logger } from "../logging/Logger.js";

async function testCanaryLogic() {
  console.log("🐦 Starting Canary Logic Verification...");

  // Mock Dependencies
  const governance = new GovernanceEngine();

  let currentDefcon = governance.getDefconLevel();

  governance.on("defcon_change", (level) => {
    console.log(`🚨 DEFCON CHANGED: ${level}`);
    currentDefcon = level;
  });

  // 1. Nominal State
  console.log("\n1. Testing Nominal State...");
  governance.updateHealth({
    latency_ms: 100,
    error_rate_5m: 0.0,
    drawdown_pct: 1.0,
  });

  if (currentDefcon !== DefconLevel.NORMAL) {
    throw new Error(`Expected NORMAL, got ${currentDefcon}`);
  }
  console.log("✅ Nominal State Verified");

  // 2. Latency Degradation (Canary Signal)
  console.log("\n2. Testing Latency Degradation (Soft Canary)...");
  governance.updateHealth({
    latency_ms: 400, // > 300ms CAUTION threshold
    error_rate_5m: 0.0,
    drawdown_pct: 1.0,
  });

  // @ts-expect-error - TS flow analysis doesn't track side effects of updateHealth callback
  if (currentDefcon !== DefconLevel.CAUTION) {
    throw new Error(`Expected CAUTION (Latency > 300), got ${currentDefcon}`);
  }
  console.log("✅ Latency Canary Triggered (CAUTION)");

  // 3. Severe Degradation (Rollback/Defensive)
  console.log("\n3. Testing Severe Degradation (Defensive Rollback)...");
  governance.updateHealth({
    latency_ms: 1200, // > 1000ms DEFENSIVE threshold
    error_rate_5m: 0.06, // > 5% Error Rate
    drawdown_pct: 1.0,
  });

  if (currentDefcon !== DefconLevel.DEFENSIVE) {
    throw new Error(`Expected DEFENSIVE, got ${currentDefcon}`);
  }
  console.log("✅ Defensive Rollback Triggered");

  // 4. Recovery
  console.log("\n4. Testing Recovery...");
  governance.updateHealth({
    latency_ms: 50,
    error_rate_5m: 0.0,
    drawdown_pct: 1.0,
  });

  if (currentDefcon !== DefconLevel.NORMAL) {
    throw new Error(`Expected Recovery to NORMAL, got ${currentDefcon}`);
  }
  console.log("✅ System Recovered");

  console.log("\n🎉 Canary/Rollback Logic Verified Successfully!");
}

testCanaryLogic().catch((err) => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
