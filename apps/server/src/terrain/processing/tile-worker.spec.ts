import { gzipSync } from 'zlib';
import { Worker } from 'worker_threads';
import * as path from 'path';

// terrain.map stores metres; the worker converts to feet and must return results
// in request order, because worldmap.ts pairs each result with the tile it asked for
describe('tile-worker', () => {
  const workerPath = path.join(__dirname, 'tile-worker.ts');

  const makeTile = (marker: number, samples: number): Buffer => {
    const raw = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) raw.writeInt16LE(marker, i * 2);
    return gzipSync(raw);
  };

  const decompress = (batch: { id: number; buffer: Buffer }[]) =>
    new Promise<{ id: number; data: Int16Array | null }[]>((resolve, reject) => {
      const worker = new Worker(
        `require('ts-node').register({transpileOnly:true}); require(${JSON.stringify(workerPath)});`,
        { eval: true },
      );
      worker.once('message', (results) => {
        worker.terminate();
        resolve(results);
      });
      worker.once('error', (err) => {
        worker.terminate();
        reject(err);
      });
      worker.postMessage(batch);
    });

  it('keeps results aligned with the requested batch order', async () => {
    // wildly different sizes so gunzip finishes out of submission order
    const batch = [
      { id: 0, buffer: makeTile(100, 1_500_000) },
      { id: 1, buffer: makeTile(200, 4_000) },
      { id: 2, buffer: makeTile(300, 900_000) },
      { id: 3, buffer: makeTile(400, 2_000) },
    ];

    const results = await decompress(batch);

    expect(results.map((r) => r.id)).toEqual([0, 1, 2, 3]);
    // metre marker -> feet, at the position it was requested from
    expect(results[0].data[0]).toBe(Math.round(100 * 3.28084));
    expect(results[1].data[0]).toBe(Math.round(200 * 3.28084));
    expect(results[2].data[0]).toBe(Math.round(300 * 3.28084));
    expect(results[3].data[0]).toBe(Math.round(400 * 3.28084));
  }, 30_000);

  it('preserves the -1 water marker instead of converting it', async () => {
    const results = await decompress([{ id: 0, buffer: makeTile(-1, 1_000) }]);

    expect(results[0].data[0]).toBe(-1);
  }, 30_000);

  it('returns null for a corrupt tile rather than throwing', async () => {
    const results = await decompress([
      { id: 0, buffer: Buffer.from([0x1f, 0x8b, 0xff, 0xff]) },
      { id: 1, buffer: makeTile(500, 1_000) },
    ]);

    expect(results[0].data).toBeNull();
    expect(results[1].data[0]).toBe(Math.round(500 * 3.28084));
  }, 30_000);
});
