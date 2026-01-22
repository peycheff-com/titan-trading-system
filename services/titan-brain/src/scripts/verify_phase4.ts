import { IntentSignal } from '../types/index.js';
import { ScavengerValidator } from '../engine/ScavengerValidator.js';

// Mock signal generator
function createMockSignal(overrides: Partial<IntentSignal> = {}): IntentSignal {
  return {
    signalId: `sig-${Date.now()}`,
    phaseId: 'phase1',
    symbol: 'BTC/USDT',
    side: 'BUY',
    requestedSize: 100, // Size 100
    timestamp: Date.now(),
    leverage: 1,
    metadata: {
      // Default valid metadata
      trade_size_mean: 100,
      trade_size_std_dev: 10,
      order_book_imbalance: 0.5, // Strong buy imbalance
    },
    ...overrides,
  };
}

async function runVerification() {
  console.log('🧪 Starting Scavenger Validation Verification...');

  // We can unit test the validator directly
  const validator = new ScavengerValidator();

  console.log('\n1. Test Valid Signal (Normal Distribution, Aligned Imbalance)');
  const validSignal = createMockSignal();
  const result1 = validator.validate(validSignal);
  console.log(`Result: ${result1.valid ? '✅ VALID' : '❌ INVALID'} ${result1.reason || ''}`);

  console.log('\n2. Test Invalid Signal (Size Outlier)');
  const outlierSignal = createMockSignal({
    requestedSize: 500, // 500 is (500-100)/10 = 40 SD away! (Limit is 2)
  });
  const result2 = validator.validate(outlierSignal);
  console.log(
    `Result: ${!result2.valid ? '✅ VETOED' : '❌ INVALIDLY APPROVED'} ${result2.reason || ''}`,
  );

  console.log('\n3. Test Invalid Signal (Fighting Imbalance)');
  const contrarianSignal = createMockSignal({
    side: 'BUY',
    metadata: {
      trade_size_mean: 100,
      trade_size_std_dev: 10,
      order_book_imbalance: -0.5, // Sell Pressure
    },
  });
  const result3 = validator.validate(contrarianSignal);
  console.log(
    `Result: ${!result3.valid ? '✅ VETOED' : '❌ INVALIDLY APPROVED'} ${result3.reason || ''}`,
  );

  console.log('\n4. Test Invalid Signal (Weak Imbalance)');
  const weakSignal = createMockSignal({
    metadata: {
      trade_size_mean: 100,
      trade_size_std_dev: 10,
      order_book_imbalance: 0.1, // Too weak (<0.3)
    },
  });
  const result4 = validator.validate(weakSignal);
  console.log(
    `Result: ${!result4.valid ? '✅ VETOED' : '❌ INVALIDLY APPROVED'} ${result4.reason || ''}`,
  );

  console.log('\nDone.');
  process.exit(0);
}

runVerification().catch(console.error);
