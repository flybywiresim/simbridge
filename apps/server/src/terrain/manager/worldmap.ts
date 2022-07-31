import { Worker } from 'worker_threads';
import * as path from 'path';
import { ElevationGrid } from '../mapformat/elevationgrid';
import { TerrainMap } from '../mapformat/terrainmap';
import { Tile } from '../mapformat/tile';
import { PositionDto } from '../dto/position.dto';
import { NavigationDisplayViewDto } from '../dto/navigationdisplayview.dto';
import { NavigationDisplayData } from './navigationdisplaydata';

require('sharp');

export interface WorldMapData {
    terrainData: TerrainMap | undefined;

    grid: { southwest: { latitude: number, longitude: number }, tileIndex: number, elevationmap: undefined | ElevationGrid }[][];
}

export class Worldmap {
    public data: WorldMapData = {
        terrainData: undefined,
        grid: [],
    };

    private tileLoaderWorker: Worker;

    private tileLoadingInProgress: boolean = false;

    private displays: { [id: string]: { viewConfig: NavigationDisplayViewDto, data: NavigationDisplayData } } = {};

    private presentPosition: PositionDto | undefined = undefined;

    public VisibilityRange: number = 400;

    private static findTileIndex(tiles: Tile[], latitude: number, longitude: number): number {
        for (let i = 0; i < tiles.length; ++i) {
            if (tiles[i].Southwest.latitude === latitude && tiles[i].Southwest.longitude === longitude) {
                return i;
            }
        }

        return -1;
    }

    constructor(mapfile: TerrainMap) {
        this.data.terrainData = mapfile;

        for (let lat = -90; lat < 90; lat += mapfile.AngularSteps.latitude) {
            this.data.grid.push([]);

            for (let lon = -180; lon < 180; lon += mapfile.AngularSteps.longitude) {
                this.data.grid[this.data.grid.length - 1].push({
                    southwest: { latitude: lat, longitude: lon },
                    tileIndex: Worldmap.findTileIndex(mapfile.Tiles, lat, lon),
                    elevationmap: undefined,
                });
            }
        }
    }

    public renderNdMap(id: string): number {
        if (id in this.displays) {
            if (this.displays[id].viewConfig !== undefined && this.displays[id].viewConfig.active === true) {
                const worker = new Worker(path.resolve(__dirname, '../utils/ndrenderer.js'), {
                    workerData: {
                        world: this,
                        viewConfig: this.displays[id].viewConfig,
                        position: this.presentPosition,
                    },
                });
                const timestamp = new Date().getTime();

                worker.on('message', (result: NavigationDisplayData) => {
                    result.Timestamp = timestamp;
                    this.displays[id].data = result;
                });

                return timestamp;
            }

            this.displays[id].data = null;
        }

        return -1;
    }

    public configureNd(display: string, config: NavigationDisplayViewDto) {
        if (!(display in this.displays)) {
            this.displays[display] = {
                viewConfig: config,
                data: null,
            };
        } else {
            this.displays[display].viewConfig = config;
        }
    }

    public async updatePosition(position: PositionDto): Promise<void> {
        if (this.tileLoadingInProgress) {
            return;
        }

        this.tileLoadingInProgress = true;
        this.presentPosition = position;

        const worker = new Worker(path.resolve(__dirname, './maploader.js'), { workerData: { world: this, position: this.presentPosition } });

        worker.on('message', (result) => {
            const loadedTiles: { row: number, column: number }[] = [];

            result.forEach((tile) => {
                loadedTiles.push({ row: tile.row, column: tile.column });
                if (tile.grid !== null) {
                    this.setElevationMap(loadedTiles[loadedTiles.length - 1], tile.grid);
                }
            });

            this.cleanupElevationCache(loadedTiles);
            this.tileLoadingInProgress = false;
        });
    }

    public static worldMapIndices(world: Worldmap, latitude: number, longitude: number): { row: number, column: number } | undefined {
        const row = Math.floor((latitude + 90) / world.data.terrainData.AngularSteps.latitude);
        const column = Math.floor((longitude + 180) / world.data.terrainData.AngularSteps.longitude);

        if (row < 0 || row >= world.data.grid.length || column < 0 || column >= world.data.grid[row].length) {
            return undefined;
        }

        return { row, column };
    }

    public static validTile(world: Worldmap, index: { row: number, column: number }): boolean {
        if (world.data.grid.length <= index.row || index.row < 0 || world.data.grid[index.row].length <= index.column || index.column < 0) {
            return false;
        }

        return world.data.grid[index.row][index.column].tileIndex >= 0 && world.data.grid[index.row][index.column].tileIndex < world.data.terrainData.Tiles.length;
    }

    public setElevationMap(index: { row: number, column: number }, map: ElevationGrid): void {
        if (Worldmap.validTile(this, index) === true && this.data.grid[index.row][index.column].elevationmap === undefined) {
            this.data.grid[index.row][index.column].elevationmap = map;
            this.data.grid[index.row][index.column].elevationmap.ElevationMap = new Int16Array(this.data.grid[index.row][index.column].elevationmap.Grid);
        }
    }

    public cleanupElevationCache(whitelist: { row: number, column: number }[]): void {
        for (let row = 0; row < this.data.grid.length; ++row) {
            for (let col = 0; col < this.data.grid[row].length; ++col) {
                const idx = whitelist.findIndex((element) => element.column === col && element.row === row);
                if (idx === -1) {
                    this.data.grid[row][col].elevationmap = undefined;
                } else {
                    whitelist.splice(idx, 1);
                }
            }
        }
    }

    public getTile(latitude: number, longitude: number): Tile | undefined {
        const index = Worldmap.worldMapIndices(this, latitude, longitude);
        if (index === undefined) {
            return undefined;
        }

        if (this.data.grid[index.row][index.column].tileIndex < 0 || this.data.grid[index.row][index.column].tileIndex >= this.data.terrainData.Tiles.length) {
            return undefined;
        }

        return this.data.terrainData.Tiles[this.data.grid[index.row][index.column].tileIndex];
    }

    public ndMap(id: string, timestamp: number): NavigationDisplayData {
        if (!(id in this.displays) || this.displays[id].viewConfig.active === false) {
            return null;
        }

        if (this.displays[id].data && this.displays[id].data.Timestamp === timestamp) {
            return this.displays[id].data;
        }

        return null;
    }
}
