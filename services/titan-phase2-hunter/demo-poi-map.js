/**
 * POI Map Component Demo
 * Demonstrates the POI Map component functionality
 */

// Safe module loading with error handling
function loadPOIMapComponent() {
  try {
    const { POIMapComponent } = require('./dist/console/POIMap');
    return POIMapComponent;
  } catch (error) {
    console.error('❌ Failed to load POIMapComponent:', error.message);
    console.log('💡 Make sure to build the project first: npm run build');
    process.exit(1);
  }
}

// POI factory functions for cleaner data creation
const createOrderBlock = (id, direction, price, distance, confidence = 85) => ({
  id,
  type: 'ORDER_BLOCK',
  direction,
  price,
  distance,
  confidence,
  age: 2,
  mitigated: false,
  strength: Math.min(95, confidence + 5)
});

const createFVG = (id, direction, price, distance, confidence = 75) => ({
  id,
  type: 'FVG',
  direction,
  price,
  distance,
  confidence,
  age: 1,
  mitigated: false,
  strength: Math.min(95, confidence + 5)
});

const createLiquidityPool = (id, direction, price, distance, confidence = 90, volume = 1000000) => ({
  id,
  type: 'LIQUIDITY_POOL',
  direction,
  price,
  distance,
  confidence,
  age: 0.5,
  mitigated: false,
  strength: Math.min(95, confidence + 5),
  volume
});

// Create sample POI data using factory functions
const samplePOIs = [
  createOrderBlock('OB_1', 'BULLISH', 50000, 0.3, 85), // Very close - red
  createFVG('FVG_1', 'BEARISH', 49500, -1.2, 75), // Close - yellow
  createLiquidityPool('LIQ_1', 'BULLISH', 51000, 2.5, 90), // Far - white
  createOrderBlock('OB_2', 'BEARISH', 48800, -0.4, 88), // Very close - red
  createFVG('FVG_2', 'BULLISH', 50200, 0.8, 82) // Close - yellow
];

function displayLegend() {
  console.log('');
  console.log('📚 Reference Guide:');
  console.log('🔴 Red: Very close (< 0.5% distance)');
  console.log('🟡 Yellow: Close (< 2% distance)');
  console.log('⚪ White: Far (>= 2% distance)');
  console.log('');
  console.log('POI Types:');
  console.log('• OB-BULL/BEAR: Order Block (Bullish/Bearish)');
  console.log('• FVG-BULL/BEAR: Fair Value Gap (Bullish/Bearish)');
  console.log('• LIQ-BULL/BEAR: Liquidity Pool (Bullish/Bearish)');
}

function runDemo() {
  // Load component safely
  const POIMapComponent = loadPOIMapComponent();
  
  // Create and configure the component
  const poiMap = new POIMapComponent();
  poiMap.updateConfig({ pois: samplePOIs });

  // Render the component
  console.log('🎯 POI Map Component Demo');
  console.log('========================');
  console.log('');

  const lines = poiMap.render();
  lines.forEach(line => console.log(line));

  displayLegend();
}

// Run the demo
if (require.main === module) {
  runDemo();
}