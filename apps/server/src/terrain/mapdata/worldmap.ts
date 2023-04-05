import { PositionData } from '../communication/types';
import { ElevationGrid } from '../fileformat/elevationgrid';
import { TerrainMap } from '../fileformat/terrainmap';
import { Tile } from '../fileformat/tile';
import { projectWgs84 } from '../processing/gpu/helper';
import { TileManager } from './tilemanager';

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

export class Worldmap {
    public GridData: GridDefinition = {
        rows: 0,
        columns: 0,
        latitudeStep: 0,
        longitudeStep: 0,
    }

    public TileManager: TileManager = null;

    public VisibilityRange: number = 700;

    public static findTileIndex(tiles: Tile[], latitude: number, longitude: number): number {
        return tiles.findIndex((t) => t.Southwest.latitude === latitude && t.Southwest.longitude === longitude);
    }

    constructor(private terrainData: TerrainMap) {
        this.TileManager = new TileManager(terrainData);

        // create the grid-metadata
        this.GridData.rows = this.TileManager.grid.length;
        this.GridData.columns = this.TileManager.grid[0].length;
        this.GridData.latitudeStep = this.terrainData.AngularSteps.latitude;
        this.GridData.longitudeStep = this.terrainData.AngularSteps.longitude;
    }

    public resetInternalData(): void {
        this.TileManager.grid.forEach((row) => {
            row.forEach((column) => {
                column.elevationmap = undefined;
            });
        });
    }

    public createGridLookupTable(position: PositionData): { row: number; column: number }[][] {
        const [southwestLat, southwestLong] = projectWgs84(position.latitude, position.longitude, 225, this.VisibilityRange * 1852);
        const southwestGrid = this.worldMapIndices(southwestLat, southwestLong);
        const [northeastLat, northeastLong] = projectWgs84(position.latitude, position.longitude, 45, this.VisibilityRange * 1852);
        const northeastGrid = this.worldMapIndices(northeastLat, northeastLong);

        let rowCount = northeastGrid.row - southwestGrid.row;
        let rowDirection = 1;
        if (southwestLat >= position.latitude) {
            // we are at the south pole
            rowCount = southwestGrid.row + northeastGrid.row;
            rowDirection = -1;
        } else if (northeastLat <= position.latitude) {
            // we are at the north pole
            rowCount = this.TileManager.grid.length - southwestGrid.row + this.TileManager.grid.length - northeastGrid.row;
        }
        rowCount += 1;

        let columnCount = northeastGrid.column - southwestGrid.column;
        if (northeastLong < southwestLong) {
            // wrap around at 180°
            columnCount = this.TileManager.grid[0].length - southwestGrid.column + northeastGrid.column;
        }
        columnCount += 1;

        // create the look up table and sort from north->south and west->east
        const retval = new Array(rowCount);
        for (let y = 0; y < rowCount; ++y) {
            let row = southwestGrid.row + rowDirection * y;
            // ensure that the row index is not outside of bounds
            if (row < 0) row = Math.abs(row);
            if (row >= this.TileManager.grid.length) row -= this.TileManager.grid.length;

            retval[rowCount - 1 - y] = new Array(columnCount);
            for (let x = 0; x < columnCount; x++) {
                const column = (southwestGrid.column + x) % this.TileManager.grid[0].length;
                retval[rowCount - 1 - y][x] = { row, column };
            }
        }

        return retval;
    }

    public updatePosition(relevantTiles: { row: number; column: number }[][]): boolean {
        let loadedTiles = 0;
        relevantTiles.forEach((row) => {
            row.forEach((cell) => {
                if (this.TileManager.grid[cell.row][cell.column].tileIndex !== -1
                    && (this.TileManager.grid[cell.row][cell.column].elevationmap === undefined
                        || this.TileManager.grid[cell.row][cell.column].elevationmap.ElevationMap === undefined)) {
                    const map = Tile.loadElevationGrid(this.terrainData.Tiles[this.TileManager.grid[cell.row][cell.column].tileIndex]);
                    if (map !== null) {
                        this.TileManager.setElevationMap(cell, map);
                        loadedTiles += 1;
                    }
                }
            });
        });

        return loadedTiles !== 0;
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

    public getSouthwestCoordinateOfTile(latitude: number, longitude: number): { latitude: number, longitude: number } {
        const index = this.worldMapIndices(latitude, longitude);
        if (index === undefined) {
            return undefined;
        }

        return { latitude: index.row * this.GridData.latitudeStep - 90.0, longitude: index.column * this.GridData.longitudeStep - 180.0 };
    }
}
