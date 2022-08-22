import { ElevationGrid } from '../mapformat/elevationgrid';
import { Worldmap } from './worldmap';
import { TerrainMap } from '../mapformat/terrainmap';

export class TileManager {
    public grid: { southwest: { latitude: number, longitude: number }, tileIndex: number, elevationmap: undefined | ElevationGrid }[][] = [];

    constructor(private terrainData: TerrainMap) {
        for (let lat = -90; lat < 90; lat += this.terrainData.AngularSteps.latitude) {
            this.grid.push([]);

            for (let lon = -180; lon < 180; lon += this.terrainData.AngularSteps.longitude) {
                this.grid[this.grid.length - 1].push({
                    southwest: { latitude: lat, longitude: lon },
                    tileIndex: Worldmap.findTileIndex(this.terrainData.Tiles, lat, lon),
                    elevationmap: undefined,
                });
            }
        }
    }

    public setElevationMap(index: { row: number, column: number }, map: ElevationGrid): void {
        if (Worldmap.validTile(this.terrainData, this.grid, index) === true) {
            this.grid[index.row][index.column].elevationmap = map;
        }
    }

    public cleanupElevationCache(whitelist: { row: number, column: number }[]): void {
        for (let row = 0; row < this.grid.length; ++row) {
            for (let col = 0; col < this.grid[row].length; ++col) {
                const idx = whitelist.findIndex((element) => element.column === col && element.row === row);
                if (idx === -1) {
                    this.grid[row][col].elevationmap = undefined;
                } else {
                    whitelist.splice(idx, 1);
                }
            }
        }
    }
}
