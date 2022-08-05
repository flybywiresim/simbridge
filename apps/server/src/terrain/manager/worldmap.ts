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

export interface GridDefinition {
    rows: number,
    columns: number,
    latitudeStep: number,
    longitudeStep: number,
}

export interface RenderingData {
    gridDefinition: GridDefinition,
    viewConfig: NavigationDisplayViewDto,
    tiles: { row: number, column: number, grid: ElevationGrid | undefined }[],
    position: PositionDto,
    timestamp: number
}

interface TileLoadingData {
    whitelist: { row: number, column: number }[];

    loadlist: { row: number, column: number, tileIndex: number }[];
}

export class Worldmap {
    private gridData: GridDefinition = {
        rows: 0,
        columns: 0,
        latitudeStep: 0,
        longitudeStep: 0,
    }

    private grid: { southwest: { latitude: number, longitude: number }, tileIndex: number, elevationmap: undefined | ElevationGrid }[][] = [];

    private tileLoaderWhitelist: { row: number, column: number }[] = [];

    private tileLoaderWorker: Worker;

    private tileLoadingInProgress: boolean = false;

    private startTime: number = 0;

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

        // create the grid-metadata
        this.gridData.rows = this.grid.length;
        this.gridData.columns = this.grid[0].length;
        this.gridData.latitudeStep = this.terrainData.AngularSteps.latitude;
        this.gridData.longitudeStep = this.terrainData.AngularSteps.longitude;

        this.tileLoaderWorker = new Worker(path.resolve(__dirname, './maploader.js'));
        this.tileLoaderWorker.postMessage({ type: 'MAP', instance: this.terrainData });
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
            console.log(`Rendering: ${new Date().getTime() - this.startTime}`);
        });

        this.ndRendererWorkerRight = new Worker(path.resolve(__dirname, '../utils/ndrenderer.js'));
        this.ndRendererWorkerRight.on('message', (result: NavigationDisplayData) => {
            this.displays.R.data = result;
            this.ndRenderingRightInProgress = false;
        });
    }

    private findTileIndices(latitude: number, longitude0: number, longitude1: number): { row: number, column: number }[] {
        const indices: { row: number, column: number }[] = [];

        for (let lon = longitude0; lon < longitude1; lon += this.terrainData.AngularSteps.longitude) {
            const index = Worldmap.worldMapIndices(this.gridData, latitude, lon);
            if (index !== undefined && Worldmap.validTile(this.terrainData, this.grid, index) === true) {
                indices.push(index);
            }
        }

        return indices;
    }

    private filterTileIndexCandidates(tileIndices: { row: number, column: number}[]): TileLoadingData {
        let loadlist: { row: number, column: number, tileIndex: number }[] = [];

        tileIndices.forEach((index) => {
            if (this.grid[index.row][index.column].elevationmap === undefined) {
                loadlist = loadlist.concat({ row: index.row, column: index.column, tileIndex: this.grid[index.row][index.column].tileIndex });
            }
        });

        return {
            whitelist: tileIndices,
            loadlist,
        };
    }

    private findRelevantTiles(position: PositionDto, rangeInNM: number): TileLoadingData {
        const southwest = WGS84.project(position.latitude, position.longitude, rangeInNM * 1852, 225);
        const northeast = WGS84.project(position.latitude, position.longitude, rangeInNM * 1852, 45);
        const tiles: TileLoadingData = { whitelist: [], loadlist: [] };

        // wrap around at 180°
        if (southwest.longitude > northeast.longitude) {
            for (let lat = southwest.latitude; lat < northeast.latitude; lat += this.terrainData.AngularSteps.latitude) {
                let indices = this.filterTileIndexCandidates(this.findTileIndices(lat, southwest.longitude, 180));
                tiles.loadlist = tiles.loadlist.concat(indices.loadlist);
                tiles.whitelist = tiles.whitelist.concat(indices.whitelist);
                indices = this.filterTileIndexCandidates(this.findTileIndices(lat, -180, northeast.longitude));
                tiles.loadlist = tiles.loadlist.concat(indices.loadlist);
                tiles.whitelist = tiles.whitelist.concat(indices.whitelist);
            }
        } else {
            for (let lat = southwest.latitude; lat < northeast.latitude; lat += this.terrainData.AngularSteps.latitude) {
                const indices = this.filterTileIndexCandidates(this.findTileIndices(lat, southwest.longitude, northeast.longitude));
                tiles.loadlist = tiles.loadlist.concat(indices.loadlist);
                tiles.whitelist = tiles.whitelist.concat(indices.whitelist);
            }
        }

        return tiles;
    }

    public renderNdMap(id: string): number {
        if (id in this.displays) {
            if (this.displays[id].viewConfig !== undefined && this.displays[id].viewConfig.active === true) {
                const timestamp = new Date().getTime();
                this.startTime = timestamp;

                // get all relevant tiles
                const rangeMeters = this.displays[id].viewConfig.mapWidth * 0.5 * this.displays[id].viewConfig.meterPerPixel;
                const tileIndices = this.findRelevantTiles(this.presentPosition, Math.round(rangeMeters * 0.000539957 + 0.5));
                const tiles: { row: number, column: number, grid: ElevationGrid | undefined }[] = [];
                tileIndices.whitelist.forEach((index) => {
                    tiles.push({
                        row: index.row,
                        column: index.column,
                        grid: this.grid[index.row][index.column].elevationmap,
                    });
                });

                const workerContent: RenderingData = {
                    gridDefinition: this.gridData,
                    viewConfig: this.displays[id].viewConfig,
                    tiles,
                    position: this.presentPosition,
                    timestamp,
                };

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

    public async updatePosition(position: PositionDto): Promise<void> {
        if (this.tileLoadingInProgress) {
            return;
        }

        this.tileLoadingInProgress = true;
        this.presentPosition = position;

        const tiles = this.findRelevantTiles(position, this.visibilityRange);
        if (tiles.loadlist.length !== 0) {
            this.tileLoaderWhitelist = tiles.whitelist;
            this.tileLoaderWorker.postMessage({ type: 'TILES', instance: tiles.loadlist });
        } else {
            this.tileLoadingInProgress = false;
        }
    }

    public static worldMapIndices(data: GridDefinition, latitude: number, longitude: number): { row: number, column: number } | undefined {
        const row = Math.floor((latitude + 90) / data.latitudeStep);
        const column = Math.floor((longitude + 180) / data.longitudeStep);

        if (row < 0 || row >= data.rows || column < 0 || column >= data.columns) {
            return undefined;
        }

        return { row, column };
    }

    public static validTile(
        terrainData: TerrainMap,
        grid: { southwest: { latitude: number, longitude: number }, tileIndex: number, elevationmap: undefined | ElevationGrid }[][],
        index: { row: number, column: number },
    ): boolean {
        if (grid.length <= index.row || index.row < 0 || grid[index.row].length <= index.column || index.column < 0) {
            return false;
        }

        return grid[index.row][index.column].tileIndex >= 0 && grid[index.row][index.column].tileIndex < terrainData.Tiles.length;
    }

    public setElevationMap(index: { row: number, column: number }, map: ElevationGrid): void {
        if (Worldmap.validTile(this.terrainData, this.grid, index) === true) {
            this.grid[index.row][index.column].elevationmap = map;
        }
    }

    public cleanupElevationCache(): void {
        for (let row = 0; row < this.grid.length; ++row) {
            for (let col = 0; col < this.grid[row].length; ++col) {
                const idx = this.tileLoaderWhitelist.findIndex((element) => element.column === col && element.row === row);
                if (idx === -1) {
                    this.grid[row][col].elevationmap = undefined;
                } else {
                    this.tileLoaderWhitelist.splice(idx, 1);
                }
            }
        }
    }

    public getTile(latitude: number, longitude: number): Tile | undefined {
        const index = Worldmap.worldMapIndices(this.gridData, latitude, longitude);
        if (index === undefined) {
            return undefined;
        }

        if (this.grid[index.row][index.column].tileIndex < 0 || this.grid[index.row][index.column].tileIndex >= this.terrainData.Tiles.length) {
            return undefined;
        }

        return this.terrainData.Tiles[this.grid[index.row][index.column].tileIndex];
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
