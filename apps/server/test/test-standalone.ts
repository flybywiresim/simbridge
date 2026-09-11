// Standalone test: Unbounded vs LRU cache memory comparison
// No project imports — pure Node.js
// Run: node --expose-gc dist/test-standalone.js

const ITERATIONS = 100;
const LRU_MAX = 50;
const PNG_SIZE = 100 * 1024;   // ~100KB per PNG chart page
const PDF_META = 50 * 1024;    // ~50KB per PDFDocumentProxy metadata

function forceGC() {
  if (global.gc) global.gc();
}

function memMB() {
  const m = process.memoryUsage();
  return {
    heap: m.heapUsed / 1024 / 1024,
    rss: m.rss / 1024 / 1024,
    ext: m.external / 1024 / 1024,
  };
}

function fmt(n: number) { return n.toFixed(1); }

// Minimal LRU for comparison
class LRUMap {
  private max: number;
  private map: Map<string, any>;
  constructor(max: number) { this.max = max; this.map = new Map(); }
  set(k: string, v: any) {
    if (this.map.has(k)) this.map.delete(k);
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(k, v);
  }
  get size() { return this.map.size; }
}

function label(s) { return s.padEnd(25); }

console.log('='.repeat(60));
console.log(' SimBridge Cache Memory Test');
console.log('='.repeat(60));
console.log(` ${ITERATIONS} unique PDFs, ${PNG_SIZE/1024}KB PNG each, ${PDF_META/1024}KB PDF metadata each`);
console.log(` Theoretical max unbounded: ${((ITERATIONS * (PNG_SIZE + PDF_META)) / 1024 / 1024).toFixed(0)}MB`);
console.log(` Theoretical max LRU(${LRU_MAX}): ${((LRU_MAX * (PNG_SIZE + PDF_META)) / 1024 / 1024).toFixed(0)}MB`);
console.log('');

// ── Test 1: Unbounded (original code) ──
console.log('─'.repeat(60));
console.log(' TEST 1: UNBOUNDED MAP (original code, no fix)');
console.log('─'.repeat(60));

forceGC();
const startUnbounded = memMB();
console.log(` Start:  heap=${startUnbounded.heap}MB rss=${startUnbounded.rss}MB`);

const unboundedPdf = new Map();
const unboundedPng = new Map();

for (let i = 0; i < ITERATIONS; i++) {
  const key = `/tmp/chart-${i}.pdf`;
  unboundedPdf.set(key, { id: i, data: Buffer.alloc(PDF_META) });
  unboundedPng.set(`${key};;1;;4`, Buffer.alloc(PNG_SIZE));

  if ((i + 1) % 25 === 0) {
    const m = memMB();
    console.log(` After ${(i+'').padStart(3)}: heap=${m.heap}MB rss=${m.rss}MB cache=${unboundedPdf.size}+${unboundedPng.size}`);
  }
}

forceGC();
const endUnbounded = memMB();
console.log(` End:    heap=${endUnbounded.heap}MB rss=${endUnbounded.rss}MB`);
console.log(` Delta:  heap=+${(endUnbounded.heap - startUnbounded.heap).toFixed(1)}MB rss=+${(endUnbounded.rss - startUnbounded.rss).toFixed(1)}MB`);
console.log(` Stored: ${unboundedPdf.size} PDF + ${unboundedPng.size} PNG (NO EVICTION)`);

unboundedPdf.clear();
unboundedPng.clear();

// ── Test 2: LRU (Phase 1 fix) ──
console.log('');
console.log('─'.repeat(60));
console.log(` TEST 2: LRU MAP (Phase 1 fix, max=${LRU_MAX})`);
console.log('─'.repeat(60));

forceGC();
const startLRU = memMB();
console.log(` Start:  heap=${startLRU.heap}MB rss=${startLRU.rss}MB`);

const lruPdf = new LRUMap(LRU_MAX);
const lruPng = new LRUMap(LRU_MAX);

for (let i = 0; i < ITERATIONS; i++) {
  const key = `/tmp/chart-${i}.pdf`;
  lruPdf.set(key, { id: i, data: Buffer.alloc(PDF_META) });
  lruPng.set(`${key};;1;;4`, Buffer.alloc(PNG_SIZE));

  if ((i + 1) % 25 === 0) {
    const m = memMB();
    console.log(` After ${(i+'').padStart(3)}: heap=${m.heap}MB rss=${m.rss}MB cache=${lruPdf.size}+${lruPng.size}`);
  }
}

forceGC();
const endLRU = memMB();
console.log(` End:    heap=${endLRU.heap}MB rss=${endLRU.rss}MB`);
console.log(` Delta:  heap=+${(endLRU.heap - startLRU.heap).toFixed(1)}MB rss=+${(endLRU.rss - startLRU.rss).toFixed(1)}MB`);
console.log(` Stored: ${lruPdf.size} PDF + ${lruPng.size} PNG (CAPPED at ${LRU_MAX})`);

// ── Comparison ──
console.log('');
console.log('='.repeat(60));
console.log(' PHASE 1 FIX IMPACT');
console.log('='.repeat(60));
const heapDelta = (endUnbounded.heap - startUnbounded.heap) - (endLRU.heap - startLRU.heap);
const rssDelta = (endUnbounded.rss - startUnbounded.rss) - (endLRU.rss - startLRU.rss);
const memSaved = ((ITERATIONS - LRU_MAX) * (PNG_SIZE + PDF_META)) / 1024 / 1024;
console.log(` Unbounded heap growth: +${(endUnbounded.heap - startUnbounded.heap).toFixed(1)}MB`);
console.log(` LRU heap growth:       +${(endLRU.heap - startLRU.heap).toFixed(1)}MB`);
console.log(` Heap saved:            ~${heapDelta.toFixed(1)}MB`);
console.log(` RSS saved:             ~${rssDelta.toFixed(1)}MB`);
console.log(` Theoretical saved:     ~${memSaved.toFixed(1)}MB (${ITERATIONS - LRU_MAX} evicted × ${(PNG_SIZE + PDF_META)/1024}KB)`);
console.log(` Eviction count:        ${ITERATIONS - LRU_MAX} PDFs + ${ITERATIONS - LRU_MAX} PNGs`);
console.log('='.repeat(60));
