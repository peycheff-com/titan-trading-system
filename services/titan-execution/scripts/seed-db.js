
import 'dotenv/config';
import { DatabaseManager } from '../DatabaseManager.js';

async function seed() {
  console.log('🌱 Seeding Titan Database...');
  
  const dbConfig = {
    type: 'sqlite',
    url: './titan_execution.db' // Development DB path
  };

  const db = new DatabaseManager(dbConfig);
  await db.initDatabase();

  try {
    // 1. Seed Recent Trades
    console.log('Inserting sample trades...');
    const trades = [
      {
        signal_id: 'seed_btc_1',
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        entry_price: 45000,
        fill_price: 45000,
        stop_price: 44000,
        tp_price: 48000,
        slippage_pct: 0.01,
        execution_latency_ms: 45,
        regime_state: 1,
        phase: 'PHASE_1_KICKSTARTER',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2) // 2 hours ago
      },
      {
        signal_id: 'seed_eth_1',
        symbol: 'ETHUSDT',
        side: 'SHORT',
        size: 5.0,
        entry_price: 2400,
        fill_price: 2399,
        stop_price: 2450,
        tp_price: 2300,
        slippage_pct: 0.02,
        execution_latency_ms: 32,
        regime_state: -1,
        phase: 'PHASE_2_TREND_RIDER',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5) // 5 hours ago
      }
    ];

    for (const trade of trades) {
      await db.insertTrade(trade);
    }

    // 2. Seed System Events
    console.log('Inserting sample system events...');
    await db.insertSystemEvent({
        event_type: 'SYSTEM_STARTUP',
        severity: 'INFO',
        description: 'Titan Execution System initialized successfully',
        context: { version: '1.0.0' },
        timestamp: new Date()
    });

    console.log('✅ Seeding complete.');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await db.close();
  }
}

seed();
