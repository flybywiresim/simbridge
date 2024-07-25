import { Tile } from './tile';

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

    const bytes = Buffer.byteLength(buffer);
    let offset = 14;
    while (offset < bytes) {
      const tile = new Tile(this, buffer, offset);
      this.Tiles.push(tile);
      offset = tile.BufferOffset + tile.BufferSize;
    }
  }
}
