import { ElevationGrid } from '../fileformat/elevationgrid';
import { TerrainMap } from '../fileformat/terrainmap';
import { Tile } from '../fileformat/tile';
import { PositionDto } from '../dto/position.dto';
import { NavigationDisplayViewDto } from '../dto/navigationdisplayview.dto';
import { projectWgs84 } from '../processing/gpu/helper';
import { NavigationDisplayData } from './navigationdisplaydata';
import { TileManager } from './tilemanager';

require('sharp');

export interface GridDefinition {
    rows: number,
    columns: number,
    latitudeStep: number,
    longitudeStep: number,
}

export interface TileData {
    row: number,
    column: number,
    grid: ElevationGrid,
}

interface TileLoadingData {
    whitelist: { row: number, column: number }[];

    loadlist: { row: number, column: number, tileIndex: number }[];
}

export class Worldmap {
    public GridData: GridDefinition = {
        rows: 0,
        columns: 0,
        latitudeStep: 0,
        longitudeStep: 0,
    }

    public TileManager: TileManager = null;

    private displays: { [id: string]: { viewConfig: NavigationDisplayViewDto, data: NavigationDisplayData } } = {};

    public VisibilityRange: number = 700;

    public static findTileIndex(tiles: Tile[], latitude: number, longitude: number): number {
        for (let i = 0; i < tiles.length; ++i) {
            if (tiles[i].Southwest.latitude === latitude && tiles[i].Southwest.longitude === longitude) {
                return i;
            }
        }

        return -1;
    }

    constructor(private terrainData: TerrainMap) {
        this.TileManager = new TileManager(terrainData);

        // create the grid-metadata
        this.GridData.rows = this.TileManager.grid.length;
        this.GridData.columns = this.TileManager.grid[0].length;
        this.GridData.latitudeStep = this.terrainData.AngularSteps.latitude;
        this.GridData.longitudeStep = this.terrainData.AngularSteps.longitude;
    }

    private findTileIndices(latitude: number, longitude0: number, longitude1: number): { row: number, column: number }[] {
        const indices: { row: number, column: number }[] = [];

        for (let lon = longitude0; lon <= longitude1; lon += this.terrainData.AngularSteps.longitude) {
            const index = this.worldMapIndices(latitude, lon);
            if (index !== undefined && Worldmap.validTile(this.terrainData, this.TileManager.grid, index) === true) {
                indices.push(index);
            }
        }

        return indices;
    }

    private filterTileIndexCandidates(tileIndices: { row: number, column: number}[]): TileLoadingData {
        let loadlist: { row: number, column: number, tileIndex: number }[] = [];

        tileIndices.forEach((index) => {
            if (this.TileManager.grid[index.row][index.column].elevationmap === undefined) {
                loadlist = loadlist.concat({ row: index.row, column: index.column, tileIndex: this.TileManager.grid[index.row][index.column].tileIndex });
            }
        });

        return {
            whitelist: tileIndices,
            loadlist,
        };
    }

    private findRelevantTiles(position: PositionDto, rangeInNM: number): TileLoadingData {
        let [southwestLat, southwestLong] = projectWgs84(position.latitude, position.longitude, 225, rangeInNM * 1852);
        let [northeastLat, northeastLong] = projectWgs84(position.latitude, position.longitude, 45, rangeInNM * 1852);
        const tiles: TileLoadingData = { whitelist: [], loadlist: [] };

        // correct the borders to catch all tiles
        southwestLat = Math.floor((southwestLat + 90) / this.GridData.latitudeStep) - 90;
        southwestLong = Math.floor((southwestLong + 180) / this.GridData.longitudeStep) - 180;
        northeastLat = Math.ceil((northeastLat + 90) / this.GridData.latitudeStep) - 90;
        northeastLong = Math.ceil((northeastLong + 180) / this.GridData.longitudeStep) - 180;

        // wrap around at 180°
        if (southwestLong > northeastLong) {
            for (let lat = southwestLat; lat <= northeastLat; lat += this.terrainData.AngularSteps.latitude) {
                let indices = this.filterTileIndexCandidates(this.findTileIndices(lat, southwestLong, 180));
                tiles.loadlist = tiles.loadlist.concat(indices.loadlist);
                tiles.whitelist = tiles.whitelist.concat(indices.whitelist);
                indices = this.filterTileIndexCandidates(this.findTileIndices(lat, -180, northeastLong));
                tiles.loadlist = tiles.loadlist.concat(indices.loadlist);
                tiles.whitelist = tiles.whitelist.concat(indices.whitelist);
            }
        } else {
            for (let lat = southwestLat; lat <= northeastLat; lat += this.terrainData.AngularSteps.latitude) {
                const indices = this.filterTileIndexCandidates(this.findTileIndices(lat, southwestLong, northeastLong));
                tiles.loadlist = tiles.loadlist.concat(indices.loadlist);
                tiles.whitelist = tiles.whitelist.concat(indices.whitelist);
            }
        }

        return tiles;
    }

    public updatePosition(position: PositionDto): TileLoadingData {
        const tiles = this.findRelevantTiles(position, this.VisibilityRange);

        // load all missing tiles
        tiles.loadlist.forEach((index) => {
            const map = Tile.loadElevationGrid(this.terrainData.Tiles[index.tileIndex]);
            if (map !== null) {
                this.TileManager.setElevationMap(index, map);
            }
        });

        return tiles;
    }

    public worldMapIndices(latitude: number, longitude: number): { row: number, column: number } | undefined {
        const row = Math.floor((latitude + 90) / this.GridData.latitudeStep);
        const column = Math.floor((longitude + 180) / this.GridData.longitudeStep);

        if (row < 0 || row >= this.GridData.rows || column < 0 || column >= this.GridData.columns) {
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

    public getTile(latitude: number, longitude: number): Tile | undefined {
        const index = this.worldMapIndices(latitude, longitude);
        if (index === undefined) {
            return undefined;
        }

        if (this.TileManager.grid[index.row][index.column].tileIndex < 0 || this.TileManager.grid[index.row][index.column].tileIndex >= this.terrainData.Tiles.length) {
            return undefined;
        }

        return this.terrainData.Tiles[this.TileManager.grid[index.row][index.column].tileIndex];
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
