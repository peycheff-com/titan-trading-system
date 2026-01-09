/**
 * POI Map Component Demo - Enhanced Version
 * Demonstrates the POI Map component functionality with multiple test scenarios
 */

const path = require('path');

// POI data factory for generating test scenarios
class POIDataFactory {
  /**
   * Create an Order Block POI
   */
  static createOrderBlock(id, direction, price, distance, confidence = 85, age = 2) {
    return {
      id,
      type: 'ORDER_BLOCK',
      direction,
      price,
      distance,
      confidence,
      age,
      mitigated: false,
      strength: Math.min(95, confidence + 5)
    };
  }

  /**
   * Create a Fair Value Gap POI
   */
  static createFVG(id, direction, price, distance, confidence = 75, age = 1) {
    return {
      id,
      type: 'FVG',
      direction,
      price,
      distance,
      confidence,
      age,
      mitigated: false,
      strength: Math.min(95, confidence + 5)
    };
  }

  /**
   * Create a Liquidity Pool POI
   */
  static createLiquidityPool(id, direction, price, distance, confidence = 90, volume = 1000000) {
    return {
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
    };
  }

  /**
   * Validate POI data structure
   */
  static validatePOI(poi) {
    const requiredFields = ['id', 'type', 'direction', 'price', 'distance', 'confidence', 'age', 'mitigated', 'strength'];
    const validTypes = ['ORDER_BLOCK', 'FVG', 'LIQUIDITY_POOL'];
    const validDirections = ['BULLISH', 'BEARISH'];

    for (const field of requiredFields) {
      if (!(field in poi)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!validTypes.includes(poi.type)) {
      throw new Error(`Invalid POI type: ${poi.type}`);
    }

    if (!validDirections.includes(poi.direction)) {
      throw new Error(`Invalid POI direction: ${poi.direction}`);
    }

    if (typeof poi.price !== 'number' || poi.price <= 0) {
      throw new Error(`Invalid price: ${poi.price}`);
    }

    if (typeof poi.confidence !== 'number' || poi.confidence < 0 || poi.confidence > 100) {
      throw new Error(`Invalid confidence: ${poi.confidence}`);
    }

    return true;
  }
}

// Test scenarios
const testScenarios = {
  basic: {
    name: 'Basic Scenario',
    description: 'Mixed POI types with different distances',
    pois: [
      POIDataFactory.createOrderBlock('OB_1', 'BULLISH', 50000, 0.3, 85), // Very close - red
      POIDataFactory.createFVG('FVG_1', 'BEARISH', 49500, -1.2, 75), // Close - yellow
      POIDataFactory.createLiquidityPool('LIQ_1', 'BULLISH', 51000, 2.5, 90), // Far - white
      POIDataFactory.createOrderBlock('OB_2', 'BEARISH', 48800, -0.4, 88), // Very close - red
      POIDataFactory.createFVG('FVG_2', 'BULLISH', 50200, 0.8, 82) // Close - yellow
    ]
  },
  
  empty: {
    name: 'Empty Scenario',
    description: 'No POIs to display',
    pois: []
  },
  
  maxCapacity: {
    name: 'Max Capacity Test',
    description: 'More than 8 POIs to test display limits',
    pois: Array.from({ length: 12 }, (_, i) => 
      POIDataFactory.createOrderBlock(
        `OB_${i}`, 
        i % 2 === 0 ? 'BULLISH' : 'BEARISH', 
        50000 + i * 100, 
        i * 0.2,
        70 + (i % 20) // Varying confidence
      )
    )
  },
  
  colorTesting: {
    name: 'Color Testing',
    description: 'Test all color categories (red, yellow, white)',
    pois: [
      POIDataFactory.createOrderBlock('RED_1', 'BULLISH', 50000, 0.2, 95), // Red (< 0.5%)
      POIDataFactory.createFVG('RED_2', 'BEARISH', 49900, -0.4, 88), // Red (< 0.5%)
      POIDataFactory.createOrderBlock('YELLOW_1', 'BULLISH', 50500, 1.0, 80), // Yellow (< 2%)
      POIDataFactory.createFVG('YELLOW_2', 'BEARISH', 49200, -1.8, 75), // Yellow (< 2%)
      POIDataFactory.createLiquidityPool('WHITE_1', 'BULLISH', 52000, 3.5, 70), // White (>= 2%)
      POIDataFactory.createOrderBlock('WHITE_2', 'BEARISH', 47500, -5.2, 65) // White (>= 2%)
    ]
  },

  sorting: {
    name: 'Sorting Test',
    description: 'Test POI sorting by distance (closest first)',
    pois: [
      POIDataFactory.createOrderBlock('FAR_1', 'BULLISH', 52000, 4.0, 70), // Should be last
      POIDataFactory.createFVG('CLOSE_1', 'BEARISH', 49900, 0.2, 90), // Should be first
      POIDataFactory.createLiquidityPool('MID_1', 'BULLISH', 51000, 2.0, 80), // Should be middle
      POIDataFactory.createOrderBlock('VERY_CLOSE', 'BEARISH', 49950, 0.1, 95) // Should be first
    ]
  }
};

/**
 * Safe module loading with error handling
 */
function loadPOIMapComponent() {
  try {
    const { POIMapComponent } = require('./dist/console/POIMap');
    return POIMapComponent;
  } catch (error) {
    console.error('❌ Failed to load POIMapComponent:', error.message);
    console.log('💡 Make sure to build the project first: npm run build');
    console.log('💡 Run: cd services/titan-phase2-hunter && npm run build');
    process.exit(1);
  }
}

/**
 * Validate all POIs in a scenario
 */
function validateScenario(scenario) {
  try {
    scenario.pois.forEach((poi, index) => {
      POIDataFactory.validatePOI(poi);
    });
    return true;
  } catch (error) {
    console.error(`❌ Validation failed for scenario "${scenario.name}":`, error.message);
    return false;
  }
}

/**
 * Run a single test scenario
 */
function runScenario(POIMapComponent, scenarioName, scenario) {
  console.log(`\n📊 ${scenario.name}`);
  console.log('='.repeat(scenario.name.length + 4));
  console.log(`📝 ${scenario.description}`);
  console.log(`📈 POI Count: ${scenario.pois.length}`);
  
  if (!validateScenario(scenario)) {
    return false;
  }

  try {
    const poiMap = new POIMapComponent();
    poiMap.updateConfig({ pois: scenario.pois });
    
    const lines = poiMap.render();
    console.log('');
    lines.forEach(line => console.log(line));
    
    return true;
  } catch (error) {
    console.error(`❌ Error running scenario "${scenario.name}":`, error.message);
    return false;
  }
}

/**
 * Display help information
 */
function displayHelp() {
  console.log('🎯 POI Map Component Demo');
  console.log('========================');
  console.log('');
  console.log('Usage: node demo-poi-map-improved.js [scenario]');
  console.log('');
  console.log('Available scenarios:');
  Object.entries(testScenarios).forEach(([key, scenario]) => {
    console.log(`  ${key.padEnd(12)} - ${scenario.description}`);
  });
  console.log('  all          - Run all scenarios');
  console.log('  help         - Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  node demo-poi-map-improved.js basic');
  console.log('  node demo-poi-map-improved.js colorTesting');
  console.log('  node demo-poi-map-improved.js all');
}

/**
 * Display color legend and POI types
 */
function displayLegend() {
  console.log('\n📚 Reference Guide');
  console.log('==================');
  console.log('');
  console.log('Color Legend:');
  console.log('🔴 Red: Very close (< 0.5% distance) - High priority');
  console.log('🟡 Yellow: Close (< 2% distance) - Medium priority');
  console.log('⚪ White: Far (>= 2% distance) - Low priority');
  console.log('');
  console.log('POI Types:');
  console.log('• OB-BULL/BEAR: Order Block (Bullish/Bearish)');
  console.log('• FVG-BULL/BEAR: Fair Value Gap (Bullish/Bearish)');
  console.log('• LIQ-BULL/BEAR: Liquidity Pool (Bullish/Bearish)');
  console.log('');
  console.log('Columns:');
  console.log('• Type: POI type and direction');
  console.log('• Price: Entry/target price level');
  console.log('• Dist: Distance from current price (%)');
  console.log('• Conf: Confidence level (0-100%)');
}

/**
 * Main execution function
 */
function main() {
  const args = process.argv.slice(2);
  const scenario = args[0] || 'help';

  if (scenario === 'help' || scenario === '--help' || scenario === '-h') {
    displayHelp();
    return;
  }

  // Load the component
  const POIMapComponent = loadPOIMapComponent();
  
  if (scenario === 'all') {
    // Run all scenarios
    console.log('🎯 POI Map Component Demo - All Scenarios');
    console.log('=========================================');
    
    let successCount = 0;
    const totalScenarios = Object.keys(testScenarios).length;
    
    for (const [scenarioName, scenarioData] of Object.entries(testScenarios)) {
      if (runScenario(POIMapComponent, scenarioName, scenarioData)) {
        successCount++;
      }
    }
    
    console.log(`\n📊 Results: ${successCount}/${totalScenarios} scenarios passed`);
    displayLegend();
    
  } else if (scenario in testScenarios) {
    // Run specific scenario
    console.log('🎯 POI Map Component Demo');
    console.log('========================');
    
    runScenario(POIMapComponent, scenario, testScenarios[scenario]);
    displayLegend();
    
  } else {
    console.error(`❌ Unknown scenario: ${scenario}`);
    console.log('💡 Use "help" to see available scenarios');
    process.exit(1);
  }
}

// Run the demo
if (require.main === module) {
  main();
}

module.exports = {
  POIDataFactory,
  testScenarios,
  runScenario
};