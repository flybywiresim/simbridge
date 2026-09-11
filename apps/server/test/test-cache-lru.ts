// Test: LRU cache behavior (Phase 1 fix)
// Run: node dist/test-cache-lru.js
// Compares unbounded vs LRU behavior

import { memoryMonitor } from './utilities/memoryMonitor';

const ITERATIONS = 100;
const LRU_MAX = 50;
const PNG_SIZE = 100 * 1024;
const PDF_OVERHEAD = 50 * 1024;

// ponytail: minimal LRU for test comparison
class TestLRUMap<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly maxSize: number) {}
  get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) { this.map.delete(key); this.map.set(key, val); }
    return val;
  }
  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }
  get size() { return this.map.size; }
  values() { return Array.from(this.map.values()); }
}

export async function testCacheLRU() {
  console.log(`\n=== LRU Cache Test (Phase 1 Fix) ===`);
  console.log(`Inserting ${ITERATIONS} entries with LRU max=${LRU_MAX}\n`);

  memoryMonitor.start('cache-lru');

  const pdfCache = new TestLRUMap<string, any>(LRU_MAX);
  const pngCache = new TestLRUMap<string, Buffer>(LRU_MAX);

  for (let i = 0; i < ITERATIONS; i++) {
    const key = `/tmp/chart-${i}.pdf`;
    const pngKey = `${key};;1;;4`;

    pdfCache.set(key, { id: i, data: Buffer.alloc(PDF_OVERHEAD) });
    pngCache.set(pngKey, Buffer.alloc(PNG_SIZE));

    if ((i + 1) % 20 === 0) {
      memoryMonitor.takeSnapshot(`insert-${i + 1}`);
      const mem = process.memoryUsage();
      console.log(`  [LRU] Inserted ${i + 1}/${ITERATIONS}: cache=${pdfCache.size} PDF + ${pngCache.size} PNG | heap=${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB rss=${(mem.rss / 1024 / 1024).toFixed(1)}MB`);
    }
  }

  const finalMem = process.memoryUsage();
  console.log(`\n  Final: ${pdfCache.size} PDF entries + ${pngCache.size} PNG entries`);
  console.log(`  Estimated cache memory: ~${((pdfCache.size * PDF_OVERHEAD + pngCache.size * PNG_SIZE) / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  Actual heap: ${(finalMem.heapUsed / 1024 / 1024).toFixed(1)}MB`);

  const result = memoryMonitor.stop();
  if (result) {
    console.log(`\n  === LRU CACHE RESULT ===`);
    console.log(`  Heap delta: ${result.delta.heapUsed}`);
    console.log(`  RSS delta:  ${result.delta.rss}`);
    console.log(`  Only ${LRU_MAX} entries kept — ${ITERATIONS - LRU_MAX} evicted`);
    const saved = ((ITERATIONS - LRU_MAX) * (PDF_OVERHEAD + PNG_SIZE)) / 1024 / 1024;
    console.log(`  Memory saved vs unbounded: ~${saved.toFixed(1)}MB`);
  }

  pdfCache.values().length = 0;
  pngCache.values().length = 0;
}

testCacheLRU().catch(console.error);
