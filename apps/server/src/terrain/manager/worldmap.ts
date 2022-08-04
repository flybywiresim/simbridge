import { Worker } from 'worker_threads';
import * as path from 'path';
import { WGS84 } from '../utils/wgs84';
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

interface TileLoadingData {
    whitelist: { row: number, column: number }[];

    loadlist: { row: number, column: number, tileIndex: number }[];
}

export class Worldmap {
    public data: WorldMapData = {
        terrainData: undefined,
        grid: [],
    };

    private tileLoaderWhitelist: { row: number, column: number }[] = [];

    private tileLoaderWorker: Worker;

    private tileLoadingInProgress: boolean = false;

    private ndRenderingLeftInProgress: boolean = false;

    private ndRendererWorkerLeft: Worker;

    private ndRenderingRightInProgress: boolean = false;

    private ndRendererWorkerRight: Worker;

    private displays: { [id: string]: { viewConfig: NavigationDisplayViewDto, data: NavigationDisplayData } } = {};

    private presentPosition: PositionDto | undefined = undefined;

    private visibilityRange: number = 400;

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

        this.tileLoaderWorker = new Worker(path.resolve(__dirname, './maploader.js'));
        this.tileLoaderWorker.postMessage({ type: 'MAP', instance: this.data.terrainData });
        this.tileLoaderWorker.on('message', (result) => {
            const loadedTiles: { row: number, column: number }[] = [];

            result.forEach((tile) => {
                loadedTiles.push({ row: tile.row, column: tile.column });
                if (tile.grid !== null) {
                    this.setElevationMap(loadedTiles[loadedTiles.length - 1], tile.grid);
                }
            });

            this.cleanupElevationCache();
            this.tileLoadingInProgress = false;
        });

        this.ndRendererWorkerLeft = new Worker(path.resolve(__dirname, '../utils/ndrenderer.js'));
        this.ndRendererWorkerLeft.on('message', (result: NavigationDisplayData) => {
            this.displays.L.data = result;
            this.ndRenderingLeftInProgress = false;
        });

        this.ndRendererWorkerRight = new Worker(path.resolve(__dirname, '../utils/ndrenderer.js'));
        this.ndRendererWorkerRight.on('message', (result: NavigationDisplayData) => {
            this.displays.R.data = result;
            this.ndRenderingRightInProgress = false;
        });
    }

    public renderNdMap(id: string): number {
        if (id in this.displays) {
            const timestamp = new Date().getTime();
            const workerContent = {
                viewConfig: this.displays[id].viewConfig,
                data: this.data,
                position: this.presentPosition,
                timestamp,
            };

            if (this.displays[id].viewConfig !== undefined && this.displays[id].viewConfig.active === true) {
                if (id === 'L') {
                    if (this.ndRenderingLeftInProgress === false) {
                        this.ndRendererWorkerLeft.postMessage(workerContent);
                        return timestamp;
                    }
                } else if (this.ndRenderingRightInProgress === false) {
                    this.ndRendererWorkerRight.postMessage(workerContent);
                    return timestamp;
                }

                if (this.displays[id].data !== null) {
                    return this.displays[id].data.Timestamp;
                }
                return -1;
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

    private findTileIndices(latitude: number, longitude0: number, longitude1: number): { row: number, column: number }[] {
        const indices: { row: number, column: number }[] = [];

        for (let lon = longitude0; lon < longitude1; lon += this.data.terrainData.AngularSteps.longitude) {
            const index = Worldmap.worldMapIndices(this.data, latitude, lon);
            if (index !== undefined && Worldmap.validTile(this.data, index) === true) {
                indices.push(index);
            }
        }

        return indices;
    }

    private filterTileIndexCandidates(tileIndices: { row: number, column: number}[]): TileLoadingData {
        let loadlist: { row: number, column: number, tileIndex: number }[] = [];

        tileIndices.forEach((index) => {
            if (this.data.grid[index.row][index.column].elevationmap === undefined) {
                loadlist = loadlist.concat({ row: index.row, column: index.column, tileIndex: this.data.grid[index.row][index.column].tileIndex });
            }
        });

        return {
            whitelist: tileIndices,
            loadlist,
        };
    }

    public async updatePosition(position: PositionDto): Promise<void> {
        if (this.tileLoadingInProgress) {
            return;
        }

        this.tileLoadingInProgress = true;
        this.presentPosition = position;

        const southwest = WGS84.project(position.latitude, position.longitude, this.visibilityRange * 1852, 225);
        const northeast = WGS84.project(position.latitude, position.longitude, this.visibilityRange * 1852, 45);
        const tiles: TileLoadingData = { whitelist: [], loadlist: [] };

        // wrap around at 180°
        if (southwest.longitude > northeast.longitude) {
            for (let lat = southwest.latitude; lat < northeast.latitude; lat += this.data.terrainData.AngularSteps.latitude) {
                let indices = this.filterTileIndexCandidates(this.findTileIndices(lat, southwest.longitude, 180));
                tiles.loadlist = tiles.loadlist.concat(indices.loadlist);
                tiles.whitelist = tiles.whitelist.concat(indices.whitelist);
                indices = this.filterTileIndexCandidates(this.findTileIndices(lat, -180, northeast.longitude));
                tiles.loadlist = tiles.loadlist.concat(indices.loadlist);
                tiles.whitelist = tiles.whitelist.concat(indices.whitelist);
            }
        } else {
            for (let lat = southwest.latitude; lat < northeast.latitude; lat += this.data.terrainData.AngularSteps.latitude) {
                const indices = this.filterTileIndexCandidates(this.findTileIndices(lat, southwest.longitude, northeast.longitude));
                tiles.loadlist = tiles.loadlist.concat(indices.loadlist);
                tiles.whitelist = tiles.whitelist.concat(indices.whitelist);
            }
        }

        if (tiles.loadlist.length !== 0) {
            this.tileLoaderWhitelist = tiles.whitelist;
            this.tileLoaderWorker.postMessage({ type: 'TILES', instance: tiles.loadlist });
        } else {
            this.tileLoadingInProgress = false;
        }
    }

    public static worldMapIndices(data: WorldMapData, latitude: number, longitude: number): { row: number, column: number } | undefined {
        const row = Math.floor((latitude + 90) / data.terrainData.AngularSteps.latitude);
        const column = Math.floor((longitude + 180) / data.terrainData.AngularSteps.longitude);

        if (row < 0 || row >= data.grid.length || column < 0 || column >= data.grid[row].length) {
            return undefined;
        }

        return { row, column };
    }

    public static validTile(data: WorldMapData, index: { row: number, column: number }): boolean {
        if (data.grid.length <= index.row || index.row < 0 || data.grid[index.row].length <= index.column || index.column < 0) {
            return false;
        }

        return data.grid[index.row][index.column].tileIndex >= 0 && data.grid[index.row][index.column].tileIndex < data.terrainData.Tiles.length;
    }

    public setElevationMap(index: { row: number, column: number }, map: ElevationGrid): void {
        if (Worldmap.validTile(this.data, index) === true) {
            this.data.grid[index.row][index.column].elevationmap = map;
        }
    }

    public cleanupElevationCache(): void {
        for (let row = 0; row < this.data.grid.length; ++row) {
            for (let col = 0; col < this.data.grid[row].length; ++col) {
                const idx = this.tileLoaderWhitelist.findIndex((element) => element.column === col && element.row === row);
                if (idx === -1) {
                    this.data.grid[row][col].elevationmap = undefined;
                } else {
                    this.tileLoaderWhitelist.splice(idx, 1);
                }
            }
        }
    }

    public getTile(latitude: number, longitude: number): Tile | undefined {
        const index = Worldmap.worldMapIndices(this.data, latitude, longitude);
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
