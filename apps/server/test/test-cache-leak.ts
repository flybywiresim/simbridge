// Test: Exercise PDF/PNG cache leak path — works with BOTH original and patched code
// Run: node dist/test-cache-leak.js

import { memoryMonitor } from './utilities/memoryMonitor';

const ITERATIONS = 100;

export async function testCacheLeak() {
  console.log(`\n=== Cache Leak Test ===`);
  console.log(`Simulating ${ITERATIONS} unique PDF cache entries\n`);

  memoryMonitor.start('cache-leak');

  // Simulate what FileService does: unbounded Map vs LRU
  // We test the RAW behavior: how much memory does 100 cached entries use?
  const pdfCache = new Map<string, any>();
  const pngCache = new Map<string, Buffer>();

  const PNG_SIZE = 100 * 1024; // ~100KB per PNG (typical chart page)
  const PDF_OVERHEAD = 50 * 1024; // ~50KB per PDFDocumentProxy metadata

  for (let i = 0; i < ITERATIONS; i++) {
    const key = `/tmp/chart-${i}.pdf`;
    const pngKey = `${key};;1;;4`;

    // Simulate PDF document proxy (lightweight stand-in)
    pdfCache.set(key, { id: i, data: Buffer.alloc(PDF_OVERHEAD) });
    // Simulate PNG buffer
    pngCache.set(pngKey, Buffer.alloc(PNG_SIZE));

    if ((i + 1) % 20 === 0) {
      memoryMonitor.takeSnapshot(`insert-${i + 1}`);
      const mem = process.memoryUsage();
      console.log(`  [UNBOUNDED] Inserted ${i + 1}/${ITERATIONS}: cache=${pdfCache.size} PDF + ${pngCache.size} PNG | heap=${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB rss=${(mem.rss / 1024 / 1024).toFixed(1)}MB`);
    }
  }

  const finalMem = process.memoryUsage();
  console.log(`\n  Final: ${pdfCache.size} PDF entries + ${pngCache.size} PNG entries`);
  console.log(`  Estimated cache memory: ~${((pdfCache.size * PDF_OVERHEAD + pngCache.size * PNG_SIZE) / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  Actual heap: ${(finalMem.heapUsed / 1024 / 1024).toFixed(1)}MB`);

  const result = memoryMonitor.stop();
  if (result) {
    console.log(`\n  === UNBOUNDED CACHE RESULT ===`);
    console.log(`  Heap delta: ${result.delta.heapUsed}`);
    console.log(`  RSS delta:  ${result.delta.rss}`);
    console.log(`  All ${ITERATIONS} entries stored — no eviction`);
  }

  // Cleanup
  pdfCache.clear();
  pngCache.clear();
}

testCacheLeak().catch(console.error);
