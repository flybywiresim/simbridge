import { Terrainmap } from '../mapformat/terrainmap';
import { Tile } from '../mapformat/tile';
import { ElevationGrid } from '../mapformat/elevationgrid';
import { ConfigurationDto } from '../dto/configuration.dto';
import { PositionDto } from '../dto/position.dto';
import { NDViewDto } from '../dto/ndview.dto';
import { loadTiles } from './maploader';
import { WGS84 } from '../utils/wgs84';

export class Worldmap {
    public Terraindata: Terrainmap | undefined = undefined;

    private grid: { southwest: { latitude: number, longitude: number }, tileIndex: number, elevationmap: undefined | ElevationGrid }[][] = [];

    private presentPosition: PositionDto | undefined = undefined;

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

    public configure(config: ConfigurationDto): void {
        this.VisibilityRange = config.visibilityRange;

        if (config.reset === true) {
            this.cleanupElevationCache([]);
        }
    }

    public updatePosition(position: PositionDto): boolean {
        this.presentPosition = position;
        loadTiles(this, position);
        return true;
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
                if (idx === -1) {
                    this.grid[row][col].elevationmap = undefined;
                } else {
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

    private colorize(elevation: number): { r: number, g: number, b: number } {
        const delta = elevation - this.presentPosition.altitude;
        let r = 0;
        let g = 0;
        let b = 0;

        // console.log(`${delta} ${this.presentPosition.altitude} ${elevation}`);
        if (elevation === 0 || delta < -2000) {
            r = 0; g = 0; b = 0;
        } else if (delta < -1000) {
            r = 119; g = 221; b = 119;
        } else if (delta < 500) {
            r = 0; g = 77; b = 0;
        } else if (delta < 1000) {
            r = 255; g = 255; b = 223;
        } else if (delta < 2000) {
            r = 255; g = 228; b = 80;
        } else {
            r = 254; g = 57; b = 57;
        }

        return { r, g, b };
    }

    public createMapND(config: NDViewDto): { buffer: number[], rows: number, columns: number } {
        if (this.presentPosition === undefined || this.Terraindata === undefined) {
            return { buffer: [], rows: 0, columns: 0 };
        }

        const start = new Date().getTime();

        const size = Math.round((config.viewRadius * 1852) / config.meterPerPixel + 0.5) * 2;
        const buffer = new Array(size * size * 3);

        const viewSouthwest = WGS84.project(this.presentPosition.latitude, this.presentPosition.longitude, config.viewRadius * 1852, 225);
        const viewNortheast = WGS84.project(this.presentPosition.latitude, this.presentPosition.longitude, config.viewRadius * 1852, 45);
        const latitudeStep = (viewNortheast.latitude - viewSouthwest.latitude) / size;
        const longitudeStep = (viewNortheast.longitude - viewSouthwest.longitude) / size;

        let color: { r: number, g: number, b: number } = { r: 0, g: 0, b: 0 };
        const coordinate = { latitude: viewNortheast.latitude, longitude: viewSouthwest.longitude };
        for (let y = 0; y < size; ++y) {
            for (let x = 0; x < size; ++x) {
                const worldIndex = this.worldMapIndices(coordinate.latitude, coordinate.longitude);

                if (this.grid[worldIndex.row][worldIndex.column].tileIndex === -1 || this.grid[worldIndex.row][worldIndex.column].elevationmap === undefined) {
                    color = this.colorize(0);
                } else {
                    const { row, column } = this.grid[worldIndex.row][worldIndex.column].elevationmap.worldToGridIndices(coordinate);
                    color = this.colorize(this.grid[worldIndex.row][worldIndex.column].elevationmap.Grid[row][column]);
                }

                buffer[(y * size + x) * 3 + 0] = color.r;
                buffer[(y * size + x) * 3 + 1] = color.g;
                buffer[(y * size + x) * 3 + 2] = color.b;

                coordinate.longitude += longitudeStep;
            }

            coordinate.longitude = viewSouthwest.longitude;
            coordinate.latitude += latitudeStep;
        }

        const delta = new Date().getTime() - start;
        console.log(`Created ND map in ${delta / 1000} seconds`);

        return { buffer, rows: size, columns: size };
    }
}
