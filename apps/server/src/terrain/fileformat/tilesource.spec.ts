import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TerrainMap } from './terrainmap';
import { TileHeaderSize } from './tile';
import { TileSource } from './tilesource';

/*
 * Tile payloads are read back from terrain.map on demand so the ~231MB file buffer can be
 * released after the headers are parsed. The contract that matters: what TileSource reads
 * must be byte-identical to the subarray view it replaced, and a released tile must stay
 * readable.
 */
describe('TileSource', () => {
  let directory: string;
  let path: string;
  let payloads: Buffer[];

  const tile = (latitude: number, longitude: number, payload: Buffer): Buffer => {
    const buf = Buffer.alloc(TileHeaderSize + payload.length);
    buf.writeUInt16LE(278, 0);
    buf.writeUInt16LE(278, 2);
    buf.writeInt8(latitude, 4);
    buf.writeInt16LE(longitude, 5);
    buf.writeUInt32LE(payload.length, 7);
    payload.copy(buf, TileHeaderSize);
    return buf;
  };

  const fileHeader = (): Buffer => {
    const buf = Buffer.alloc(14);
    buf.writeInt16LE(-84, 0);
    buf.writeInt16LE(82, 2);
    buf.writeInt16LE(-180, 4);
    buf.writeInt16LE(179, 6);
    buf.writeUInt8(1, 8);
    buf.writeUInt8(1, 9);
    buf.writeFloatLE(0.215, 10);
    return buf;
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'tilesource-'));
    path = join(directory, 'terrain.map');

    payloads = [Buffer.from([1, 2, 3, 4, 5]), Buffer.alloc(4096, 0xab), Buffer.from([9])];

    writeFileSync(
      path,
      Buffer.concat([
        fileHeader(),
        tile(47, 11, payloads[0]),
        tile(0, 0, Buffer.alloc(0)), // placeholder between real tiles
        tile(-33, 151, payloads[1]),
        tile(10, 10, payloads[2]),
      ]),
    );
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('reads back exactly what the in-memory view held, after release', async () => {
    const map = new TerrainMap(readFileSync(path));
    const views = map.Tiles.map((t) => Buffer.from(t.CompressedData));

    const source = new TileSource(path);
    await source.openFile();
    map.releaseCompressedData();

    expect(map.Tiles.every((t) => t.CompressedData === null)).toBe(true);

    for (let i = 0; i < map.Tiles.length; i++) {
      const read = await source.read(map.Tiles[i]);
      expect(read).not.toBeNull();
      expect(Buffer.compare(read, views[i])).toBe(0);
      expect(Buffer.compare(read, payloads[i])).toBe(0);
    }

    await source.close();
  });

  it('returns null instead of throwing once closed', async () => {
    const map = new TerrainMap(readFileSync(path));
    const source = new TileSource(path);
    await source.openFile();

    expect(source.isOpen).toBe(true);
    await source.close();

    expect(source.isOpen).toBe(false);
    await expect(source.read(map.Tiles[0])).resolves.toBeNull();
  });

  it('returns null for a missing file rather than rejecting', async () => {
    const map = new TerrainMap(readFileSync(path));
    const source = new TileSource(join(directory, 'does-not-exist.map'));

    await expect(source.openFile()).rejects.toThrow();
    await expect(source.read(map.Tiles[0])).resolves.toBeNull();
  });

  it('closing twice is safe', async () => {
    const source = new TileSource(path);
    await source.openFile();

    await source.close();
    await expect(source.close()).resolves.toBeUndefined();
  });
});
