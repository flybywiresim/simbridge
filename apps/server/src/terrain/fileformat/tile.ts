import { TerrainMap } from './terrainmap';

// rows u16, columns u16, southwest lat i8, southwest lon i16, payload length u32
export const TileHeaderSize = 11;

export class Tile {
  public Southwest: { latitude: number; longitude: number } = { latitude: 0, longitude: 0 };

  public BufferOffset: number = 0;

  public BufferSize: number = 0;

  public GridDimension: { rows: number; columns: number } = { rows: 0, columns: 0 };

  public CompressedData: Buffer = null;

  constructor(
    private readonly parent: TerrainMap,
    buffer: Buffer,
    offset: number,
  ) {
    // extract the tile header
    this.GridDimension.rows = buffer.readUInt16LE(offset);
    this.GridDimension.columns = buffer.readUInt16LE(offset + 2);
    this.Southwest.latitude = buffer.readInt8(offset + 4);
    this.Southwest.longitude = buffer.readInt16LE(offset + 5);
    this.BufferSize = buffer.readUInt32LE(offset + 7);
    this.BufferOffset = offset + TileHeaderSize;
    this.CompressedData = buffer.subarray(this.BufferOffset, this.BufferOffset + this.BufferSize);
  }

  // dropped once the terrain.map buffer is released; TileSource reads it back on demand
  public releaseCompressedData(): void {
    this.CompressedData = null;
  }
}
