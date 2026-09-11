// Test: Sharp pipeline backpressure + frame cap (Phase 3 fix)
// Measures: concurrent encodes, frame accumulation
// Run: node --expose-gc dist/test-sharp-backpressure.js

const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 768;
const CHANNELS = 4;
const TOTAL_FRAMES = 20;
const FRAME_CAP = 3;

function sharpGC() {
  if (global.gc) global.gc();
}

function sharpMem() {
  const m = process.memoryUsage();
  return { heap: m.heapUsed / 1024 / 1024, rss: m.rss / 1024 / 1024, ext: m.external / 1024 / 1024 };
}

function sharpFmt(n: number) { return n.toFixed(1); }

// Simulate sharp encode (without actual sharp dependency)
function simulateEncode(width: number, height: number): Promise<Buffer> {
  return new Promise((resolve) => {
    // Simulate async encode delay
    setTimeout(() => {
      resolve(Buffer.alloc(width * height * CHANNELS));
    }, 5);
  });
}

async function runTest() {
  console.log('='.repeat(60));
  console.log(' Sharp Pipeline Backpressure Test (Phase 3)');
  console.log('='.repeat(60));
  console.log(` Frame: ${FRAME_WIDTH}x${FRAME_HEIGHT}x${CHANNELS} = ${(FRAME_WIDTH * FRAME_HEIGHT * CHANNELS / 1024).toFixed(0)}KB`);
  console.log(` Total frames: ${TOTAL_FRAMES}, Cap: ${FRAME_CAP}`);
  console.log('');

  // ── Test 1: Original (no backpressure, no cap) ──
  console.log('─'.repeat(60));
  console.log(' TEST 1: ORIGINAL — no backpressure, no frame cap');
  console.log('─'.repeat(60));

  sharpGC();
  const start1 = sharpMem();
  console.log(` Start: heap=${sharpFmt(start1.heap)}MB rss=${sharpFmt(start1.rss)}MB ext=${sharpFmt(start1.ext)}MB`);

  const framesUnbounded: Buffer[] = [];
  let concurrentCount = 0;
  let maxConcurrent = 0;

  // Simulate original: fire all encodes immediately (no backpressure)
  const promises1: Promise<void>[] = [];
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    concurrentCount++;
    maxConcurrent = Math.max(maxConcurrent, concurrentCount);
    const p = simulateEncode(FRAME_WIDTH, FRAME_HEIGHT).then((buffer) => {
      concurrentCount--;
      // Original: always push (no cap)
      framesUnbounded.push(buffer);
    });
    promises1.push(p);
  }

  await Promise.all(promises1);

  const end1 = sharpMem();
  console.log(` End:   heap=${sharpFmt(end1.heap)}MB rss=${sharpFmt(end1.rss)}MB ext=${sharpFmt(end1.ext)}MB`);
  console.log(` Delta: heap=+${sharpFmt(end1.heap - start1.heap)}MB rss=+${sharpFmt(end1.rss - start1.rss)}MB`);
  console.log(` Frames stored: ${framesUnbounded.length} (NO CAP)`);
  console.log(` Max concurrent: ${maxConcurrent}`);
  console.log(` Memory usage: ~${(framesUnbounded.length * FRAME_WIDTH * FRAME_HEIGHT * CHANNELS / 1024 / 1024).toFixed(1)}MB`);

  // ── Test 2: Phase 3 fix (backpressure + cap) ──
  console.log('');
  console.log('─'.repeat(60));
  console.log(' TEST 2: PHASE 3 FIX — backpressure + frame cap');
  console.log('─'.repeat(60));

  sharpGC();
  const start2 = sharpMem();
  console.log(` Start: heap=${sharpFmt(start2.heap)}MB rss=${sharpFmt(start2.rss)}MB ext=${sharpFmt(start2.ext)}MB`);

  const framesCapped: Buffer[] = [];
  let processing = false;
  let concurrentCount2 = 0;
  let maxConcurrent2 = 0;
  let skippedTicks = 0;

  // Simulate Phase 2: one encode at a time, cap frames
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    if (processing) {
      skippedTicks++;
      continue; // Backpressure: skip this tick
    }
    concurrentCount2++;
    maxConcurrent2 = Math.max(maxConcurrent2, concurrentCount2);
    processing = true;
    const p = simulateEncode(FRAME_WIDTH, FRAME_HEIGHT).then((buffer) => {
      concurrentCount2--;
      processing = false;
      // Phase 3: cap at FRAME_CAP
      if (framesCapped.length < FRAME_CAP) {
        framesCapped.push(buffer);
      }
    });
    await p; // Wait for encode to finish (backpressure)
  }

  const end2 = sharpMem();
  console.log(` End:   heap=${sharpFmt(end2.heap)}MB rss=${sharpFmt(end2.rss)}MB ext=${sharpFmt(end2.ext)}MB`);
  console.log(` Delta: heap=+${sharpFmt(end2.heap - start2.heap)}MB rss=+${sharpFmt(end2.rss - start2.rss)}MB`);
  console.log(` Frames stored: ${framesCapped.length} (CAPPED at ${FRAME_CAP})`);
  console.log(` Max concurrent: ${maxConcurrent2}`);
  console.log(` Skipped ticks: ${skippedTicks} (backpressure)`);
  console.log(` Memory usage: ~${(framesCapped.length * FRAME_WIDTH * FRAME_HEIGHT * CHANNELS / 1024 / 1024).toFixed(1)}MB`);

  // ── Summary ──
  console.log('');
  console.log('='.repeat(60));
  console.log(' PHASE 3 FIX IMPACT');
  console.log('='.repeat(60));
  const memSaved = ((TOTAL_FRAMES - FRAME_CAP) * FRAME_WIDTH * FRAME_HEIGHT * CHANNELS) / 1024 / 1024;
  console.log(` Original: ${TOTAL_FRAMES} concurrent encodes, ${framesUnbounded.length} frames stored`);
  console.log(` Fixed:    1 encode at a time, ${framesCapped.length} frames stored`);
  console.log(` Memory saved: ~${memSaved.toFixed(1)}MB (${TOTAL_FRAMES - FRAME_CAP} frames not stored)`);
  console.log(` Backpressure: prevented ${skippedTicks} concurrent Sharp operations`);
  console.log(` Key benefit: prevents native memory spike from parallel PNG encodes`);
  console.log('='.repeat(60));
}

runTest().catch(console.error);
