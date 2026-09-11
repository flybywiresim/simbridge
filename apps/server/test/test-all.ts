// Combined memory leak test runner
// Run: node dist/test-all.js
// Runs all leak tests sequentially with memory snapshots between each

import { memoryMonitor } from './utilities/memoryMonitor';

async function runTests() {
  console.log('=== SimBridge Memory Leak Test Suite ===\n');
  console.log('Methodology:');
  console.log('  1. Run each leak path in isolation');
  console.log('  2. Record memory before/after');
  console.log('  3. Compare with/without fix\n');

  // Baseline
  memoryMonitor.takeSnapshot('baseline');
  const baseline = process.memoryUsage();
  console.log(`Baseline: heap=${(baseline.heapUsed / 1024 / 1024).toFixed(1)}MB rss=${(baseline.rss / 1024 / 1024).toFixed(1)}MB\n`);

  // Force GC if available
  if (global.gc) {
    global.gc();
    console.log('GC triggered before tests\n');
  }

  // Test 1: Cache leak
  console.log('--- Test 1: Cache Leak (Phase 1) ---');
  const { testCacheLeak } = await import('./test-cache-leak');
  await testCacheLeak();

  if (global.gc) global.gc();
  memoryMonitor.takeSnapshot('after-phase1');

  // Test 2: Sharp pipeline
  console.log('\n--- Test 2: Sharp Pipeline (Phase 3) ---');
  const { testSharpLeak } = await import('./test-sharp-leak');
  await testSharpLeak();

  if (global.gc) global.gc();
  memoryMonitor.takeSnapshot('after-phase3');

  // Summary
  console.log('\n=== Summary ===');
  const final = process.memoryUsage();
  console.log(`Final: heap=${(final.heapUsed / 1024 / 1024).toFixed(1)}MB rss=${(final.rss / 1024 / 1024).toFixed(1)}MB`);
  console.log(`Delta: heap=${((final.heapUsed - baseline.heapUsed) / 1024 / 1024).toFixed(1)}MB rss=${((final.rss - baseline.rss) / 1024 / 1024).toFixed(1)}MB`);
  console.log('\nCSV files saved in simbridge directory for analysis.');
}

runTests().catch(console.error);
