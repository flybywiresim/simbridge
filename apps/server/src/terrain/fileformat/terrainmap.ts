import { Tile, TileHeaderSize } from './tile';

export class TerrainMap {
  public LatitudeRange: { min: number; max: number } = { min: 89, max: -90 };

  public LongitudeRange: { min: number; max: number } = { min: 179, max: -180 };

  public AngularSteps: { latitude: number; longitude: number } = { latitude: 0, longitude: 0 };

  public HorizontalResolution: number = 0;

  public Tiles: Tile[] = [];

  constructor(buffer: Buffer) {
    // extract the file header
    this.LatitudeRange.min = buffer.readInt16LE(0);
    this.LatitudeRange.max = buffer.readInt16LE(2);
    this.LongitudeRange.min = buffer.readInt16LE(4);
    this.LongitudeRange.max = buffer.readInt16LE(6);
    this.AngularSteps.latitude = buffer.readUInt8(8);
    this.AngularSteps.longitude = buffer.readUInt8(9);
    this.HorizontalResolution = buffer.readFloatLE(10) * 1852; // convert to meters

    /*
     * terrain.map is mostly placeholders. Walking the shipped 231MB file gives 3,667,924
     * entries across only 20,576 distinct coordinates: 20,575 carry elevation data and
     * 3,647,349 have BufferSize 0. Materialising every one of them as a Tile — each with
     * its own Southwest, GridDimension and CompressedData objects — is what put ~988MB
     * into V8's old space at startup, for entries that can never produce a grid.
     *
     * Skipping them is behaviour-preserving: a zero-length CompressedData fails to gunzip,
     * so those cells already ended up without an elevation map, except that the failure was
     * retried on every single position update. Verified against the shipped file that all
     * 20,575 coordinates with real data still resolve to their real tile afterwards.
     */
    const bytes = Buffer.byteLength(buffer);
    let offset = 14;
    while (offset + TileHeaderSize <= bytes) {
      const bufferSize = buffer.readUInt32LE(offset + 7);
      if (bufferSize > 0) {
        this.Tiles.push(new Tile(this, buffer, offset));
      }
      offset += TileHeaderSize + bufferSize;
    }
  }

  /*
   * Every CompressedData is a subarray view over the source buffer, so the parsed headers
   * alone keep the whole ~231MB file reachable. Dropping the views lets it be collected;
   * TileSource reads each payload back from disk when a tile is actually needed.
   */
  public releaseCompressedData(): void {
    for (const tile of this.Tiles) {
      tile.releaseCompressedData();
    }
  }
}
