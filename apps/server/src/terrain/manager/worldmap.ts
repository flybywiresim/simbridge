import { Worker } from 'worker_threads';
import { Terrainmap } from '../mapformat/terrainmap';
import { Tile } from '../mapformat/tile';
import { ElevationGrid } from '../mapformat/elevationgrid';
import { Configuration } from '../dto/configuration.dto';
import { Position } from '../dto/position.dto';
import { loadTiles } from './maploader';

export class Worldmap {
    private tileloader: Worker | undefined = undefined;

    public Terraindata: Terrainmap | undefined = undefined;

    private grid: { southwest: { latitude: number, longitude: number }, tileIndex: number, elevationmap: undefined | ElevationGrid }[][] = [];

    public VisibilityRange: number = 250;

    private static findTileIndex(tiles: Tile[], latitude: number, longitude: number): number {
        for (let i = 0; i < tiles.length; ++i) {
            if (tiles[i].Southwest.latitude === latitude && tiles[i].Southwest.longitude === longitude) {
                return i;
            }
        }

        return -1;
    }

    constructor(mapfile: Terrainmap) {
        this.Terraindata = mapfile;

        for (let lat = -90; lat < 90; lat += mapfile.AngularSteps.latitude) {
            this.grid.push([]);

            for (let lon = -180; lon < 180; lon += mapfile.AngularSteps.longitude) {
                this.grid[this.grid.length - 1].push({
                    southwest: { latitude: lat, longitude: lon },
                    tileIndex: Worldmap.findTileIndex(mapfile.Tiles, lat, lon),
                    elevationmap: undefined,
                });
            }
        }
    }

    public configure(config: Configuration) {
        this.VisibilityRange = config.visibilityRange;

        if (config.reset === true) {
            this.tileloader = undefined;

            this.grid.forEach((row) => {
                for (let i = 0; i < row.length; ++i) {
                    row[i].elevationmap = undefined;
                }
            });
        }
    }

    public updatePosition(position: Position): void {
        if (this.tileloader === undefined) {
            loadTiles(this, position);
            // this.tileloader = new Worker('./apps/server/src/terrain/manager/maploader.ts', {
            //    workerData: {
            //        worldmap: this,
            //        position,
            //    },
            // });
            //
            // this.tileloader = this.tileloader.on('message', (_) => undefined);
        }
    }

    public worldMapIndices(latitude: number, longitude: number): { row: number, column: number } | undefined {
        const row = Math.floor((latitude + 90) / this.Terraindata.AngularSteps.latitude);
        const column = Math.floor((longitude + 180) / this.Terraindata.AngularSteps.longitude);

        if (row < 0 || row >= this.grid.length || column < 0 || column >= this.grid[row].length) {
            return undefined;
        }

        return { row, column };
    }

    public validTile(index: { row: number, column: number }): boolean {
        if (this.grid.length <= index.row || index.row < 0 || this.grid[index.row].length <= index.column || index.column < 0) {
            return false;
        }

        return this.grid[index.row][index.column].tileIndex >= 0 && this.grid[index.row][index.column].tileIndex < this.Terraindata.Tiles.length;
    }

    public loadElevationMap(index: { row: number, column: number }): void {
        if (this.validTile(index) === true && this.grid[index.row][index.column].elevationmap === undefined) {
            this.grid[index.row][index.column].elevationmap = this.Terraindata.Tiles[this.grid[index.row][index.column].tileIndex].elevationGrid();
        }
    }

    public cleanupElevationCache(whitelist: { row: number, column: number }[]): void {
        for (let row = 0; row < this.grid.length; ++row) {
            for (let col = 0; col < this.grid[row].length; ++col) {
                const idx = whitelist.findIndex((element) => element.column === col && element.row === row);
                if (idx !== -1) {
                    this.grid[row][col].elevationmap = undefined;
                    whitelist.splice(idx, 1);
                }
            }
        }
    }

    public getTile(latitude: number, longitude: number): Tile | undefined {
        const index = this.worldMapIndices(latitude, longitude);
        if (index === undefined) {
            return undefined;
        }

        if (this.grid[index.row][index.column].tileIndex < 0 || this.grid[index.row][index.column].tileIndex >= this.Terraindata.Tiles.length) {
            return undefined;
        }

        return this.Terraindata.Tiles[this.grid[index.row][index.column].tileIndex];
    }
}
