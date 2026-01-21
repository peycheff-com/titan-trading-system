import {
  FastPathClient,
  FillReport,
  getNatsClient,
  IntentSignal,
  SignalSource,
} from '@titan/shared';
import { TreasuryRepository } from '../db/repositories/TreasuryRepository.js';
import { DatabaseManager } from '../db/DatabaseManager.js';
import { ConfigManager } from '@titan/shared';
import { TitanBrainConfig } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

async function verifySignalFlow() {
  console.log('🚀 Verifying Signal Flow (Brain -> Execution -> Brain/DB)...');

  // 1. Setup Dependencies
  const configManager = new ConfigManager();
  await configManager.loadBrainConfig();
  const config = configManager.getBrainConfig() as unknown as TitanBrainConfig;

  const nats = getNatsClient();
  await nats.connect({
    servers: [process.env.NATS_URL || 'nats://localhost:4222'],
  });
  console.log('✅ NATS Connected');

  const dbManager = new DatabaseManager(config.database);
  await dbManager.connect();
  const treasuryRepo = new TreasuryRepository(dbManager);
  console.log('✅ DB Connected');

  const ipcClient = new FastPathClient({
    socketPath: '/tmp/titan-ipc.sock',
    source: 'brain' as SignalSource,
  });

  // Attempt to connect to IPC (Execution Engine must be running)
  try {
    await ipcClient.connect();
    console.log('✅ IPC Connected');
  } catch (e) {
    console.error('❌ Failed to connect to IPC. Is titan-execution-rs running?');
    process.exit(1);
  }

  // 2. Prepare Test Data
  const testSignalId = `test-signal-${Date.now()}`;
  const symbol = 'BTCUSDT';
  const symbolToken = symbol.replace('/', '_');
  const testSignal: IntentSignal = {
    signal_id: testSignalId,
    source: 'brain',
    symbol: symbol,
    direction: 'LONG',
    entry_zone: { min: 90000, max: 91000 },
    stop_loss: 89000,
    take_profits: [92000, 95000],
    confidence: 0.9,
    leverage: 1.0,
    timestamp: Date.now(),
    // Add required fields
    velocity: 0,
    trap_type: 'NONE',
  };

  console.log(`📡 Sending Test Signal: ${testSignalId}`);

  // 3. Setup Listener for Fill Report (Verification)
  const fillPromise = new Promise<FillReport>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for FillReport')), 10000);

    nats.subscribe(`titan.evt.exec.fill.v1.*.*.${symbolToken}`, (msg: FillReport) => {
      if (msg.signal_id === testSignalId) {
        clearTimeout(timeout);
        resolve(msg);
      }
    });
  });

  // 4. Execute Flow
  try {
    // Step 4a: PREPARE
    const prepareRes = await ipcClient.sendPrepare(testSignal);
    if (!prepareRes.prepared) {
      throw new Error(`Prepare rejected: ${prepareRes.reason}`);
    }
    console.log('✅ Signal PREPARED');

    // Step 4b: CONFIRM
    const confirmRes = await ipcClient.sendConfirm(testSignalId);
    if (!confirmRes.executed) {
      throw new Error(`Confirm rejected: ${confirmRes.reason}`);
    }
    console.log('✅ Signal CONFIRMED');

    // Step 4c: Wait for Fill Report
    console.log('⏳ Waiting for Fill Report...');
    const fill = await fillPromise;
    console.log('✅ Fill Report Received:', fill);

    // 5. Assertions
    console.log('🔍 Verifying Data Integrity...');

    // Assert 1: Client Order ID (Internal) Tracing
    // In this test, since we manually constructed the signal, the client_order_id in FillReport
    // should match generated logic in Rust or passed through.
    // Wait, current Rust logic generates client_order_id from SignalID-Timestamp or similar.
    // Let's check if it's present and looks valid.
    if (!fill.client_order_id || fill.client_order_id.length === 0) {
      throw new Error('❌ client_order_id is MISSING or empty in FillReport');
    }
    console.log(`   ✅ client_order_id present: ${fill.client_order_id}`);

    // Assert 2: Execution ID (Exchange) Present
    if (!fill.execution_id || fill.execution_id.length === 0) {
      // Depending on mock exchange this might be empty/mocked.
      // But it should be present in the struct.
      console.warn(
        "⚠️ execution_id is empty (expected if Mock Exchange doesn't generate one, but struct field exists)",
      );
    } else {
      console.log(`   ✅ execution_id present: ${fill.execution_id}`);
    }

    // Assert 3: Database Persistence
    // Give AccountingService a moment to persist
    await new Promise((r) => setTimeout(r, 1000));

    // Query DB directly
    // We need to access the pool directly or use repo
    // Using raw query via DB Manager
    const rows = await dbManager.queryAll<{ count: string }>(
      `SELECT count(*) as count FROM fills WHERE signal_id = $1`,
      [testSignalId],
    );

    const count = parseInt(rows[0].count, 10);
    if (count !== 1) {
      throw new Error(`❌ Database verification failed. Expected 1 record, found ${count}`);
    }

    // detailed check
    const record = await dbManager.queryOne<any>(`SELECT * FROM fills WHERE signal_id = $1`, [
      testSignalId,
    ]);

    if (record.order_id !== fill.client_order_id) {
      throw new Error(
        `❌ DB Mismatch: order_id (${record.order_id}) != fill.client_order_id (${fill.client_order_id})`,
      );
    }
    console.log('✅ Database Persistence Verified');
  } catch (error) {
    console.error('❌ Test Failed:', error);
    process.exit(1);
  } finally {
    await ipcClient.disconnect();
    await nats.close();
    await dbManager.disconnect();
    process.exit(0);
  }
}

// Run
verifySignalFlow().catch(console.error);
