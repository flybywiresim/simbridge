import { ElevationGrid } from '../types';
import { Worldmap } from './worldmap';
import { TerrainMap } from '../fileformat/terrainmap';

export class TileManager {
  public grid: {
    southwest: { latitude: number; longitude: number };
    tileIndex: number;
    elevationmap: undefined | ElevationGrid;
  }[][] = [];

  private tileIndexByCoord: Map<string, number> = new Map();

  constructor(private terrainData: TerrainMap) {
    for (let i = 0; i < this.terrainData.Tiles.length; i++) {
      const t = this.terrainData.Tiles[i];
      this.tileIndexByCoord.set(`${t.Southwest.latitude},${t.Southwest.longitude}`, i);
    }

    const latStep = this.terrainData.AngularSteps.latitude;
    const lonStep = this.terrainData.AngularSteps.longitude;
    for (let lat = -90; lat < 90; lat += latStep) {
      const row: {
        southwest: { latitude: number; longitude: number };
        tileIndex: number;
        elevationmap: undefined | ElevationGrid;
      }[] = [];
      for (let lon = -180; lon < 180; lon += lonStep) {
        row.push({
          southwest: { latitude: lat, longitude: lon },
          tileIndex: this.tileIndexByCoord.get(`${lat},${lon}`) ?? -1,
          elevationmap: undefined,
        });
      }
      this.grid.push(row);
    }
  }

  public setElevationMap(index: { row: number; column: number }, map: ElevationGrid): void {
    if (Worldmap.validTile(this.terrainData, this.grid, index) === true) {
      this.grid[index.row][index.column].elevationmap = map;
    }
  }

  public clearAllElevationMaps(): void {
    for (let row = 0; row < this.grid.length; ++row) {
      for (let col = 0; col < this.grid[row].length; ++col) {
        this.grid[row][col].elevationmap = undefined;
      }
    }
  }

  public cleanupElevationCache(grid: { row: number; column: number }[][]): void {
    const keepSet = new Set<string>();
    for (const row of grid) {
      for (const cell of row) {
        keepSet.add(`${cell.row},${cell.column}`);
      }
    }

    for (let row = 0; row < this.grid.length; ++row) {
      for (let col = 0; col < this.grid[row].length; ++col) {
        if (!keepSet.has(`${row},${col}`)) {
          this.grid[row][col].elevationmap = undefined;
        }
      }
    }
  }
}
