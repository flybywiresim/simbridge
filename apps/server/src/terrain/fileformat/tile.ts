import { gunzipSync } from 'zlib';
import { ElevationGrid } from '../types';
import { TerrainMap } from './terrainmap';

export class Tile {
  public Southwest: { latitude: number; longitude: number } = { latitude: 0, longitude: 0 };

  public BufferOffset: number = 0;

  public BufferSize: number = 0;

  public GridDimension: { rows: number; columns: number } = { rows: 0, columns: 0 };

  private compressedData: Buffer = null;

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
    this.BufferOffset = offset + 11;
    this.compressedData = buffer.subarray(this.BufferOffset, this.BufferOffset + this.BufferSize);
  }

  public static loadElevationGrid(tile: Tile): ElevationGrid {
    const northeast = {
      latitude: tile.Southwest.latitude + tile.parent.AngularSteps.latitude,
      longitude: tile.Southwest.longitude + tile.parent.AngularSteps.longitude,
    };
    const retval = new ElevationGrid(tile.Southwest, northeast, tile.GridDimension.columns, tile.GridDimension.rows);
    const decompressed = Buffer.from(gunzipSync(tile.compressedData));

    let offset = 0;
    for (let row = 0; row < tile.GridDimension.rows; ++row) {
      for (let col = 0; col < tile.GridDimension.columns; ++col) {
        retval.ElevationMap[row * tile.GridDimension.columns + col] = decompressed.readInt16LE(offset);
        if (retval.ElevationMap[row * tile.GridDimension.columns + col] !== -1) {
          retval.ElevationMap[row * tile.GridDimension.columns + col] = Math.round(
            retval.ElevationMap[row * tile.GridDimension.columns + col] * 3.28084,
          );
        }
        offset += 2;
      }
    }

    return retval;
  }
}
