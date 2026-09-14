import { parentPort } from 'worker_threads';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(gunzip);

parentPort.on('message', async (batch: { id: number; buffer: Buffer }[]) => {
  // indexed by id, NOT push(): gunzip resolves out of order and the caller
  // pairs results[i] with its own tilesToLoad[i]
  const results: { id: number; data: Int16Array | null }[] = new Array(batch.length);

  await Promise.all(
    batch.map(async (item, index) => {
      try {
        const decompressed = await gunzipAsync(item.buffer);
        // copy out of the pooled Buffer: an Int16Array view needs an even byteOffset
        // and would otherwise keep the whole pool slab alive
        const int16 = new Int16Array(decompressed.byteLength >> 1);
        for (let i = 0; i < int16.length; i++) {
          const metres = decompressed.readInt16LE(i * 2);
          // converts m to ft (terrain.map stores metres)
          int16[i] = metres !== -1 ? Math.round(metres * 3.28084) : -1;
        }
        results[index] = { id: item.id, data: int16 };
      } catch {
        results[index] = { id: item.id, data: null };
      }
    }),
  );

  parentPort.postMessage(results);
});
