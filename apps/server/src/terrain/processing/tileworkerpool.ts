import { Worker } from 'worker_threads';
import * as path from 'path';
import * as os from 'os';

// real OS threads — true multi-core utilization beyond libuv's 4-thread limit

// generous: a full 320nm batch is a few hundred ms, this only catches a wedged worker
const TileDecompressTimeoutMs = 15_000;

interface DecompressResult {
  id: number;
  data: Int16Array | null;
}

export class TileWorkerPool {
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private queue: {
    batch: { id: number; buffer: Buffer }[];
    resolve: (results: DecompressResult[]) => void;
  }[] = [];

  private readonly size: number;

  constructor(poolSize?: number) {
    this.size = poolSize ?? Math.min(4, os.cpus().length);
    this.respawnPool();
  }

  private respawnPool(): void {
    for (let i = 0; i < this.size; i++) {
      const worker = this.spawn();
      this.workers.push(worker);
      this.idleWorkers.push(worker);
    }
  }

  public decompress(buffers: Buffer[]): Promise<DecompressResult[]> {
    if (buffers.length === 0) return Promise.resolve([]);

    const batch = buffers.map((buf, i) => ({ id: i, buffer: buf }));

    // the pool is a module-level singleton that outlives an unload/reload cycle, and
    // shutdown() empties it — without this, a decompress() after shutdown would queue
    // forever with no worker left to drain it
    if (this.workers.length === 0) this.respawnPool();

    return new Promise((resolve) => {
      if (this.idleWorkers.length > 0) {
        const worker = this.idleWorkers.pop();
        this.runBatch(worker, batch, resolve);
      } else {
        this.queue.push({ batch, resolve });
      }
    });
  }

  private runBatch(
    worker: Worker,
    batch: { id: number; buffer: Buffer }[],
    resolve: (results: DecompressResult[]) => void,
  ): void {
    let settled = false;

    // a crashed or wedged worker must never strand the promise: updatePosition()
    // awaits it, and every further decompress() would pile up in this.queue forever
    const finish = (results: DecompressResult[], reusable: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeListener('message', handler);
      worker.removeListener('error', onFailure);
      worker.removeListener('exit', onFailure);

      const next = reusable ? worker : this.replaceWorker(worker);
      if (next !== null) {
        if (this.queue.length > 0) {
          const queued = this.queue.shift();
          this.runBatch(next, queued.batch, queued.resolve);
        } else {
          this.idleWorkers.push(next);
        }
      }

      resolve(results);
    };

    const failed = () => batch.map((item) => ({ id: item.id, data: null as Int16Array | null }));
    const handler = (results: DecompressResult[]) => finish(results, true);
    const onFailure = () => finish(failed(), false);
    const timer = setTimeout(() => onFailure(), TileDecompressTimeoutMs);

    worker.on('message', handler);
    worker.once('error', onFailure);
    worker.once('exit', onFailure);
    worker.postMessage(batch);
  }

  private replaceWorker(dead: Worker): Worker | null {
    const index = this.workers.indexOf(dead);
    if (index === -1) return null; // pool was shut down while the batch was in flight

    dead.terminate();
    const worker = this.spawn();
    this.workers[index] = worker;
    return worker;
  }

  private spawn(): Worker {
    const worker = new Worker(path.join(__dirname, 'tile-worker.js'));
    worker.unref();
    return worker;
  }

  public shutdown(): void {
    for (const w of this.workers) {
      w.terminate();
    }
    this.workers = [];
    this.idleWorkers = [];

    // release anything still awaiting us instead of leaving the callers hanging
    const pending = this.queue;
    this.queue = [];
    for (const item of pending) {
      item.resolve(item.batch.map((entry) => ({ id: entry.id, data: null })));
    }
  }
}
