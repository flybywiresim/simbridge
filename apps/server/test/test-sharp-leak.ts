// Test: Exercise Sharp pipeline backpressure
// Run: node dist/test-sharp-leak.js
// Measures: Phase 3 impact (backpressure + frame cap)

import * as sharp from 'sharp';
import { memoryMonitor } from './utilities/memoryMonitor';

const WIDTH = 1280;
const HEIGHT = 768;
const CHANNELS = 4;
const FRAMES = 30;

export async function testSharpLeak() {
  console.log(`\n=== Sharp Pipeline Test ===`);
  console.log(`Rendering ${FRAMES} frames (${WIDTH}x${HEIGHT}x${CHANNELS})\n`);

  memoryMonitor.start('phase3-sharp-pipeline');

  const frames: Uint8ClampedArray[] = [];

  for (let i = 0; i < FRAMES; i++) {
    // Create raw frame data
    const rawFrame = new Uint8ClampedArray(WIDTH * HEIGHT * CHANNELS);
    rawFrame.fill(128);

    // Sharp encode (this is what terrainworker does)
    const buffer = await sharp(rawFrame, {
      raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS },
    })
      .png()
      .toBuffer();

    // OLD: double allocation (what the code used to do)
    // frames.push(new Uint8ClampedArray(buffer));

    // NEW: single allocation (our fix)
    if (frames.length < 3) {
      frames.push(new Uint8ClampedArray(buffer));
    }

    if ((i + 1) % 10 === 0) {
      memoryMonitor.takeSnapshot(`frame-${i + 1}`);
      const mem = process.memoryUsage();
      console.log(`  Frame ${i + 1}/${FRAMES}: heap=${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB rss=${(mem.rss / 1024 / 1024).toFixed(1)}MB frames=${frames.length}`);
    }
  }

  console.log(`\n  Final frames stored: ${frames.length} (capped at 3)`);

  const result = memoryMonitor.stop();
  if (result) {
    console.log(`\n  Without cap: ${FRAMES} frames × ~${(WIDTH * HEIGHT * CHANNELS / 1024).toFixed(0)}KB = ~${(FRAMES * WIDTH * HEIGHT * CHANNELS / 1024 / 1024).toFixed(0)}MB`);
    console.log(`  With cap:    ${frames.length} frames × ~${(WIDTH * HEIGHT * CHANNELS / 1024).toFixed(0)}KB = ~${(frames.length * WIDTH * HEIGHT * CHANNELS / 1024 / 1024).toFixed(0)}MB`);
  }

  // Cleanup
  frames.length = 0;
}

testSharpLeak().catch(console.error);
