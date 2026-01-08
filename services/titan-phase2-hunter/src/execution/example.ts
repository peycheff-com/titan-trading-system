/**
 * Example usage of LimitOrderExecutor
 * 
 * Demonstrates how to use the LimitOrderExecutor in the Hunter system
 */

import { LimitOrderExecutor } from './LimitOrderExecutor';
import { BybitPerpsClient } from '../exchanges/BybitPerpsClient';
import { SignalData, OrderBlock } from '../types';

/**
 * Example: Using LimitOrderExecutor for Post-Only order execution
 */
async function exampleUsage(): Promise<void> {
  // Initialize Bybit client (would use real credentials in production)
  const bybitClient = new BybitPerpsClient('your-api-key', 'your-api-secret');
  
  // Initialize LimitOrderExecutor with custom config
  const executor = new LimitOrderExecutor(bybitClient, {
    orderTimeout: 60000,        // 60 seconds
    priceMoveCancelThreshold: 0.002,  // 0.2%
    levelFailThreshold: 0.005,  // 0.5%
    stopLossPercent: 0.015,     // 1.5%
    takeProfitPercent: 0.045,   // 4.5% (3:1 R:R)
    atrPeriod: 14,
    maxRetries: 2
  });

  // Set up event listeners
  executor.on('order:placed', (orderId, symbol, price) => {
    console.log(`🎯 Order placed: ${symbol} @ ${price} (ID: ${orderId})`);
  });

  executor.on('order:filled', (orderId, fillPrice, positionSize) => {
    console.log(`✅ Order filled: ${orderId} @ ${fillPrice}, size: ${positionSize}`);
  });

  executor.on('order:cancelled', (orderId, reason) => {
    console.log(`❌ Order cancelled: ${orderId} - ${reason}`);
  });

  executor.on('position:created', (position) => {
    console.log(`📊 Position created: ${position.symbol} ${position.side} @ ${position.entryPrice}`);
  });

  // Example signal from Hologram Engine
  const signal: SignalData = {
    symbol: 'BTCUSDT',
    direction: 'LONG',
    hologramStatus: 'A+',
    alignmentScore: 85,
    rsScore: 0.05,
    sessionType: 'LONDON',
    poiType: 'ORDER_BLOCK',
    cvdConfirmation: true,
    confidence: 90,
    entryPrice: 49900,  // Will be overridden by Order Block level
    stopLoss: 49250,    // Will be calculated
    takeProfit: 52250,  // Will be calculated
    positionSize: 0.1,  // Will be calculated
    leverage: 3,
    timestamp: Date.now()
  };

  // Example Order Block from InefficiencyMapper
  const orderBlock: OrderBlock = {
    type: 'BULLISH',
    high: 50100,
    low: 49900,         // Entry level for LONG
    barIndex: 100,
    timestamp: Date.now() - 300000, // 5 minutes ago
    mitigated: false,
    confidence: 90
  };

  // Current account equity
  const equity = 10000; // $10,000

  try {
    // Place Post-Only order at Order Block level
    const result = await executor.placePostOnlyOrder(signal, orderBlock, equity);
    
    if (result.success) {
      console.log(`🎯 Post-Only order placed successfully:`);
      console.log(`   Order ID: ${result.orderId}`);
      console.log(`   Position Size: ${result.positionSize}`);
      console.log(`   Stop Loss: ${result.stopLoss}`);
      console.log(`   Take Profit: ${result.takeProfit}`);
      
      // Order will be automatically monitored for:
      // - 60-second timeout
      // - Price movement > 0.2% (cancellation)
      // - Level failure > 0.5% wick (cancellation)
      // - Fill confirmation
      
    } else {
      console.error(`❌ Order placement failed: ${result.error}`);
    }

  } catch (error) {
    console.error(`❌ Execution error:`, error);
  }

  // Example: Manual cancellation if needed
  setTimeout(async () => {
    const activeOrders = executor.getActiveOrders();
    console.log(`📊 Active orders: ${activeOrders.length}`);
    
    // Cancel all orders if needed
    if (activeOrders.length > 0) {
      const cancelResult = await executor.cancelAllOrders();
      console.log(`🚨 Cancelled ${cancelResult.success} orders, ${cancelResult.failed} failed`);
    }
    
    // Cleanup
    executor.destroy();
  }, 30000); // After 30 seconds
}

/**
 * Example: Position sizing calculation
 */
async function examplePositionSizing(): Promise<void> {
  const bybitClient = new BybitPerpsClient('your-api-key', 'your-api-secret');
  const executor = new LimitOrderExecutor(bybitClient);

  try {
    const symbol = 'BTCUSDT';
    const entryPrice = 50000;
    const equity = 10000;
    const leverage = 3;

    const positionSize = await executor.calcPositionSize(symbol, entryPrice, equity, leverage);
    
    console.log(`📊 Position Sizing Example:`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Entry Price: $${entryPrice}`);
    console.log(`   Account Equity: $${equity}`);
    console.log(`   Leverage: ${leverage}x`);
    console.log(`   Calculated Position Size: ${positionSize}`);
    
    // Calculate notional value
    const notionalValue = positionSize * entryPrice;
    const riskPercent = (notionalValue / equity) * 100;
    
    console.log(`   Notional Value: $${notionalValue.toFixed(2)}`);
    console.log(`   Risk as % of Equity: ${riskPercent.toFixed(2)}%`);

  } catch (error) {
    console.error(`❌ Position sizing error:`, error);
  } finally {
    executor.destroy();
  }
}

/**
 * Example: Stop and target calculation
 */
function exampleStopAndTarget(): void {
  const bybitClient = new BybitPerpsClient('your-api-key', 'your-api-secret');
  const executor = new LimitOrderExecutor(bybitClient);

  // LONG example
  const longEntry = 50000;
  const longResult = executor.setStopAndTarget(longEntry, 'LONG');
  
  console.log(`🎯 LONG Position @ $${longEntry}:`);
  console.log(`   Stop Loss: $${longResult.stopLoss.toFixed(2)} (-1.5%)`);
  console.log(`   Take Profit: $${longResult.takeProfit.toFixed(2)} (+4.5%)`);
  
  const longRisk = longEntry - longResult.stopLoss;
  const longReward = longResult.takeProfit - longEntry;
  const longRR = longReward / longRisk;
  console.log(`   Risk:Reward = 1:${longRR.toFixed(1)}`);
  console.log('');

  // SHORT example
  const shortEntry = 50000;
  const shortResult = executor.setStopAndTarget(shortEntry, 'SHORT');
  
  console.log(`🎯 SHORT Position @ $${shortEntry}:`);
  console.log(`   Stop Loss: $${shortResult.stopLoss.toFixed(2)} (+1.5%)`);
  console.log(`   Take Profit: $${shortResult.takeProfit.toFixed(2)} (-4.5%)`);
  
  const shortRisk = shortResult.stopLoss - shortEntry;
  const shortReward = shortEntry - shortResult.takeProfit;
  const shortRR = shortReward / shortRisk;
  console.log(`   Risk:Reward = 1:${shortRR.toFixed(1)}`);

  executor.destroy();
}

// Export examples for testing
export {
  exampleUsage,
  examplePositionSizing,
  exampleStopAndTarget
};

// Run examples if called directly
if (require.main === module) {
  console.log('🎯 LimitOrderExecutor Examples\n');
  
  console.log('1. Stop and Target Calculation:');
  exampleStopAndTarget();
  
  console.log('\n2. Position Sizing (requires API connection):');
  // examplePositionSizing();
  
  console.log('\n3. Full Usage Example (requires API connection):');
  // exampleUsage();
  
  console.log('\n✅ Examples complete');
}