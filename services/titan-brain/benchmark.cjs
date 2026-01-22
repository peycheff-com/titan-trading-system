const { performance, PerformanceObserver } = require('perf_hooks');
const os = require('os');

console.log('🚀 Starting Titan Brain Micro-Benchmark...');
console.log(`System: ${os.type()} ${os.release()} | ${os.cpus()[0].model}`);
console.log(`Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);

const obs = new PerformanceObserver((items) => {
  items.getEntries().forEach((entry) => {
    console.log(`⏱️  ${entry.name}: ${entry.duration.toFixed(2)}ms`);
  });
});
obs.observe({ entryTypes: ['measure'] });

async function runBenchmark() {
  const memoryStart = process.memoryUsage().heapUsed;
  
  performance.mark('start-process');
  
  // Simulate high-frequency event loop load
  let operations = 0;
  const start = Date.now();
  
  performance.mark('start-load');
  while (Date.now() - start < 2000) {
    // Intense JSON parsing and object creation simulation
    const data = JSON.parse(JSON.stringify({ 
      id: Math.random(), 
      price: 50000 + Math.random() * 1000,
      ts: Date.now() 
    }));
    operations++;
    if (operations % 100000 === 0) {
      global.gc && global.gc(); // Optional if exposed
    }
  }
  performance.mark('end-load');
  performance.measure('Load simulation (2s)', 'start-load', 'end-load');

  const memoryEnd = process.memoryUsage().heapUsed;
  console.log(`\n📊 Results:`);
  console.log(`- Operations/sec: ${(operations / 2).toLocaleString()}`);
  console.log(`- Memory Delta: ${((memoryEnd - memoryStart) / 1024 / 1024).toFixed(2)} MB`);
  
  if (operations > 500000) {
    console.log('✅ Performance: EXCELLENT');
  } else if (operations > 100000) {
    console.log('⚠️ Performance: ACCEPTABLE');
  } else {
    console.log('❌ Performance: POOR');
  }
}

runBenchmark().catch(console.error);
