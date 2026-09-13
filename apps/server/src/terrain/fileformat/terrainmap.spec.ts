import { TerrainMap } from './terrainmap';
import { TileHeaderSize } from './tile';

/*
 * The shipped terrain.map holds 3,667,924 entries over 20,576 coordinates; all but 20,575
 * have a zero-length payload. Turning each placeholder into a Tile cost ~1GB of V8 old
 * space and ~3s of startup, and left cells whose gunzip failed on every position update.
 */
describe('TerrainMap parsing', () => {
  const header = (rows: number, columns: number, latitude: number, longitude: number, payload: Buffer): Buffer => {
    const buf = Buffer.alloc(TileHeaderSize + payload.length);
    buf.writeUInt16LE(rows, 0);
    buf.writeUInt16LE(columns, 2);
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

  const build = (tiles: Buffer[]): Buffer => Buffer.concat([fileHeader(), ...tiles]);

  it('reads the file header', () => {
    const map = new TerrainMap(build([]));

    expect(map.AngularSteps).toEqual({ latitude: 1, longitude: 1 });
    expect(map.LatitudeRange).toEqual({ min: -84, max: 82 });
    expect(map.LongitudeRange).toEqual({ min: -180, max: 179 });
  });

  it('keeps tiles that carry elevation data', () => {
    const payload = Buffer.from([1, 2, 3, 4, 5, 6]);
    const map = new TerrainMap(build([header(278, 278, 47, 11, payload)]));

    expect(map.Tiles).toHaveLength(1);
    expect(map.Tiles[0].Southwest).toEqual({ latitude: 47, longitude: 11 });
    expect(map.Tiles[0].GridDimension).toEqual({ rows: 278, columns: 278 });
    expect(map.Tiles[0].BufferSize).toBe(payload.length);
    expect(Buffer.compare(map.Tiles[0].CompressedData, payload)).toBe(0);
  });

  it('drops zero-payload placeholders without losing the real tiles after them', () => {
    const empty = Buffer.alloc(0);
    const first = Buffer.from([9, 9]);
    const second = Buffer.from([7, 7, 7]);

    const map = new TerrainMap(
      build([
        header(278, 278, 10, 20, empty),
        header(278, 278, 47, 11, first),
        header(278, 278, 11, 21, empty),
        header(278, 278, 12, 22, empty),
        header(278, 278, -33, 151, second),
        header(278, 278, 13, 23, empty),
      ]),
    );

    expect(map.Tiles).toHaveLength(2);
    expect(map.Tiles.map((t) => t.Southwest)).toEqual([
      { latitude: 47, longitude: 11 },
      { latitude: -33, longitude: 151 },
    ]);
    // payloads still line up, so offsets kept advancing correctly past the placeholders
    expect(Buffer.compare(map.Tiles[0].CompressedData, first)).toBe(0);
    expect(Buffer.compare(map.Tiles[1].CompressedData, second)).toBe(0);
  });

  it('never keeps a tile without a payload', () => {
    const map = new TerrainMap(
      build([
        header(278, 278, 1, 1, Buffer.alloc(0)),
        header(278, 278, 2, 2, Buffer.from([1])),
        header(278, 278, 3, 3, Buffer.alloc(0)),
      ]),
    );

    expect(map.Tiles.every((tile) => tile.BufferSize > 0)).toBe(true);
  });

  it('stops cleanly on a truncated trailing header', () => {
    const truncated = Buffer.concat([build([header(278, 278, 5, 5, Buffer.from([1, 2]))]), Buffer.alloc(4)]);

    expect(() => new TerrainMap(truncated)).not.toThrow();
    expect(new TerrainMap(truncated).Tiles).toHaveLength(1);
  });
});
