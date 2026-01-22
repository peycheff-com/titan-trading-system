import { IntentSignal } from '../types/index.js';
import { HunterPredicates } from '../engine/HunterPredicates.js';

// Mock signal generator for Phase 2
function createHunterSignal(overrides: Partial<IntentSignal> = {}): IntentSignal {
  return {
    signalId: `hunter-sig-${Date.now()}`,
    phaseId: 'phase2',
    symbol: 'BTC/USDT',
    side: 'BUY',
    requestedSize: 1000,
    timestamp: Date.now(),
    leverage: 2,
    metadata: {
      // Default valid hunter metadata
      has_liquidation_cluster: true,
      cluster_intensity: 80, // > 50
      context_score: 85, // > 70
      structure_break: 'BMS_LONG',
    },
    ...overrides,
  };
}

async function runVerification() {
  console.log('🏹 Starting Hunter Predicates Verification...');

  const validator = new HunterPredicates();

  console.log('\n1. Test Valid Hunter Signal (Strong Cluster & Structure)');
  const validSignal = createHunterSignal();
  const result1 = validator.validate(validSignal);
  console.log(`Result: ${result1.valid ? '✅ VALID' : '❌ INVALID'} ${result1.reason || ''}`);

  console.log('\n2. Test Invalid Signal (Weak Cluster)');
  const weakClusterSignal = createHunterSignal({
    metadata: {
      has_liquidation_cluster: true,
      cluster_intensity: 30, // Too low (< 50)
      context_score: 85,
      structure_break: 'BMS_LONG',
    },
  });
  const result2 = validator.validate(weakClusterSignal);
  console.log(
    `Result: ${!result2.valid ? '✅ VETOED' : '❌ INVALIDLY APPROVED'} ${result2.reason || ''}`,
  );

  console.log('\n3. Test Invalid Signal (Structure Mismatch)');
  const mismatchSignal = createHunterSignal({
    side: 'BUY',
    metadata: {
      has_liquidation_cluster: true,
      cluster_intensity: 80,
      context_score: 85,
      structure_break: 'BMS_SHORT', // Conflict!
    },
  });
  const result3 = validator.validate(mismatchSignal);
  console.log(
    `Result: ${!result3.valid ? '✅ VETOED' : '❌ INVALIDLY APPROVED'} ${result3.reason || ''}`,
  );

  console.log('\n4. Test Invalid Signal (Low Context Score)');
  const lowQualitySignal = createHunterSignal({
    metadata: {
      has_liquidation_cluster: true,
      cluster_intensity: 80,
      context_score: 50, // < 70
      structure_break: 'BMS_LONG',
    },
  });
  const result4 = validator.validate(lowQualitySignal);
  console.log(
    `Result: ${!result4.valid ? '✅ VETOED' : '❌ INVALIDLY APPROVED'} ${result4.reason || ''}`,
  );

  console.log('\n5. Test Invalid Signal (Missing Metadata)');
  const noMetadataSignal = createHunterSignal({
    metadata: undefined,
  });
  const result5 = validator.validate(noMetadataSignal);
  console.log(
    `Result: ${!result5.valid ? '✅ VETOED' : '❌ INVALIDLY APPROVED'} ${result5.reason || ''}`,
  );

  console.log('\nDone.');
  process.exit(0);
}

runVerification().catch(console.error);
