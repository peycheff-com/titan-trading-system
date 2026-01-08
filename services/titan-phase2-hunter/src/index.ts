/**
 * Titan Phase 2 - The Hunter
 * Holographic Market Structure Engine for Institutional-Grade Swing Trading
 * 
 * Entry point for the Hunter system
 */

import { config } from 'dotenv';
import { HunterHUD } from './console/HunterHUD';

// Load environment variables
config();

/**
 * Main entry point for Titan Phase 2 - The Hunter
 */
async function main(): Promise<void> {
  console.log('🎯 Titan Phase 2 - The Hunter');
  console.log('📊 Holographic Market Structure Engine');
  console.log('💰 Capital Range: $2,500 → $50,000');
  console.log('⚡ Leverage: 3-5x');
  console.log('🎯 Target: 3:1 R:R (1.5% stop, 4.5% target)');
  console.log('📈 Win Rate: 55-65%');
  console.log('');
  console.log('🔄 Initializing Hunter HUD...');
  
  // Initialize and start the Hunter HUD
  const hud = new HunterHUD({
    onExit: () => {
      console.log('\n👋 Hunter HUD shutting down...');
      process.exit(0);
    },
    onConfig: () => {
      console.log('\n⚙️ Configuration panel requested (F1)');
      // TODO: Implement configuration panel in subsequent tasks
    }
  });
  
  // Start the HUD
  hud.start();
  
  // Keep the process alive
  process.on('SIGINT', () => {
    hud.stop();
    console.log('\n👋 Hunter HUD shutting down...');
    process.exit(0);
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main().catch((error: Error) => {
    console.error('❌ Failed to start Hunter:', error);
    process.exit(1);
  });
}

export { main };