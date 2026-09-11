import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getSimbridgeDir } from './pathUtil';

// ponytail: lightweight memory monitor — logs heap/rss/external/cache stats to CSV
// Usage: import { memoryMonitor } from './memoryMonitor';
//        memoryMonitor.start('phase1-cache-fix');
//        // ... run workload ...
//        memoryMonitor.stop();

interface MemorySnapshot {
  timestamp: number;
  label: string;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
}

class MemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private interval: NodeJS.Timeout | null = null;
  private csvPath: string = '';
  private phaseLabel: string = '';

  start(phaseLabel: string, intervalMs = 5000): void {
    this.phaseLabel = phaseLabel;
    this.snapshots = [];
    this.csvPath = join(getSimbridgeDir(), `memory-${phaseLabel}-${Date.now()}.csv`);

    // header
    const header = 'timestamp,label,heapUsedMB,heapTotalMB,externalMB,arrayBuffersMB,rssMB\n';
    writeFileSync(this.csvPath, header);

    this.interval = setInterval(() => {
      this.takeSnapshot('tick');
    }, intervalMs);

    this.takeSnapshot('start');
    console.log(`[MemoryMonitor] Started: ${phaseLabel} → ${this.csvPath}`);
  }

  takeSnapshot(label: string): void {
    const mem = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      label,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      rss: mem.rss,
    };
    this.snapshots.push(snapshot);

    const row = [
      snapshot.timestamp,
      label,
      (mem.heapUsed / 1024 / 1024).toFixed(2),
      (mem.heapTotal / 1024 / 1024).toFixed(2),
      (mem.external / 1024 / 1024).toFixed(2),
      (mem.arrayBuffers / 1024 / 1024).toFixed(2),
      (mem.rss / 1024 / 1024).toFixed(2),
    ].join(',');

    appendFileSync(this.csvPath, row + '\n');
  }

  stop(): { start: MemorySnapshot; end: MemorySnapshot; delta: Record<string, string> } | null {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.takeSnapshot('stop');

    if (this.snapshots.length < 2) return null;

    const start = this.snapshots[0];
    const end = this.snapshots[this.snapshots.length - 1];

    const delta = {
      heapUsed: `${((end.heapUsed - start.heapUsed) / 1024 / 1024).toFixed(2)} MB`,
      rss: `${((end.rss - start.rss) / 1024 / 1024).toFixed(2)} MB`,
      external: `${((end.external - start.external) / 1024 / 1024).toFixed(2)} MB`,
      arrayBuffers: `${((end.arrayBuffers - start.arrayBuffers) / 1024 / 1024).toFixed(2)} MB`,
    };

    console.log(`[MemoryMonitor] Stopped: ${this.phaseLabel}`);
    console.log(`  Heap delta:   ${delta.heapUsed}`);
    console.log(`  RSS delta:    ${delta.rss}`);
    console.log(`  External delta: ${delta.external}`);
    console.log(`  CSV: ${this.csvPath}`);

    return { start, end, delta };
  }

  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }
}

export const memoryMonitor = new MemoryMonitor();
