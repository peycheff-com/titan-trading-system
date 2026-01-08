/**
 * Example usage of BinanceSpotClient
 * 
 * This demonstrates how to use the BinanceSpotClient for CVD monitoring
 */

import { BinanceSpotClient } from './BinanceSpotClient';
import { Trade } from '../types';

// Example: CVD calculation using BinanceSpotClient
async function exampleCVDMonitoring() {
  const client = new BinanceSpotClient();
  
  // Track CVD for BTCUSDT
  let cvd = 0;
  const trades: Trade[] = [];
  
  // Subscribe to aggregate trades
  client.subscribeAggTrades('BTCUSDT', (trade: Trade) => {
    // Add to trade history (keep last 1000 trades)
    trades.push(trade);
    if (trades.length > 1000) {
      trades.shift();
    }
    
    // Update CVD
    if (trade.side === 'BUY') {
      cvd += trade.quantity;
    } else {
      cvd -= trade.quantity;
    }
    
    console.log(`Trade: ${trade.side} ${trade.quantity} @ ${trade.price}, CVD: ${cvd.toFixed(4)}`);
  });
  
  // Handle errors
  client.onError((error) => {
    console.error('Binance client error:', error.message);
  });
  
  // Handle reconnections
  client.onReconnect(() => {
    console.log('Binance client reconnected');
  });
  
  // Get current spot price
  try {
    const price = await client.getSpotPrice('BTCUSDT');
    console.log(`Current BTCUSDT price: ${price}`);
  } catch (error) {
    console.error('Failed to get spot price:', error);
  }
  
  // Monitor connection status
  setInterval(() => {
    const status = client.getConnectionStatus();
    console.log(`Connection status: ${status}`);
  }, 30000);
  
  // Cleanup after 60 seconds (for demo purposes)
  setTimeout(() => {
    console.log('Closing connection...');
    client.close();
  }, 60000);
}

// Run example if this file is executed directly
if (require.main === module) {
  exampleCVDMonitoring().catch(console.error);
}

export { exampleCVDMonitoring };