import { ElevationGrid } from '../mapformat/elevationgrid';
import { Terrainmap } from '../mapformat/terrainmap';
import { Tile } from '../mapformat/tile';
import { ConfigurationDto } from '../dto/configuration.dto';
import { PositionDto } from '../dto/position.dto';
import { NDViewDto } from '../dto/ndview.dto';
import { loadTiles } from './maploader';
import { NDRenderer } from '../utils/ndrenderer';

export class Worldmap {
    public Terraindata: Terrainmap | undefined = undefined;

    private displays: { [id: string]: { renderer: NDRenderer, map: { buffer: SharedArrayBuffer, rows: number, columns: number } } } = {};

    public Grid: { southwest: { latitude: number, longitude: number }, tileIndex: number, elevationmap: undefined | ElevationGrid }[][] = [];

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
            this.Grid.push([]);

            for (let lon = -180; lon < 180; lon += mapfile.AngularSteps.longitude) {
                this.Grid[this.Grid.length - 1].push({
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

    private renderNdMaps(): void {
        // TODO put this in a worker thread (per render-call)
        for (const id in this.displays) {
            if (this.displays[id].renderer.ViewConfig.active === true) {
                this.displays[id].renderer.render(this.presentPosition).then((map) => {
                    this.displays[id].map = map;
                });
            } else if (this.displays[id].map.rows !== 0 || this.displays[id].map.columns !== 0) {
                this.displays[id].map = { buffer: undefined, rows: 0, columns: 0 };
            }
        }
    }

    public configureNd(config: NDViewDto) {
        if (!(config.display in this.displays)) {
            this.displays[config.display] = {
                renderer: new NDRenderer(this),
                map: { buffer: undefined, rows: 0, columns: 0 },
            };
        }
        this.displays[config.display].renderer.configureView(config);

        this.renderNdMaps();
    }

    public async updatePosition(position: PositionDto): Promise<void> {
        this.presentPosition = position;

        // TODO put this in a worker thread
        loadTiles(this, position);
        this.renderNdMaps();
    }

    public worldMapIndices(latitude: number, longitude: number): { row: number, column: number } | undefined {
        const row = Math.floor((latitude + 90) / this.Terraindata.AngularSteps.latitude);
        const column = Math.floor((longitude + 180) / this.Terraindata.AngularSteps.longitude);

        if (row < 0 || row >= this.Grid.length || column < 0 || column >= this.Grid[row].length) {
            return undefined;
        }

        return { row, column };
    }

    public validTile(index: { row: number, column: number }): boolean {
        if (this.Grid.length <= index.row || index.row < 0 || this.Grid[index.row].length <= index.column || index.column < 0) {
            return false;
        }

        return this.Grid[index.row][index.column].tileIndex >= 0 && this.Grid[index.row][index.column].tileIndex < this.Terraindata.Tiles.length;
    }

    public loadElevationMap(index: { row: number, column: number }): void {
        if (this.validTile(index) === true && this.Grid[index.row][index.column].elevationmap === undefined) {
            this.Grid[index.row][index.column].elevationmap = this.Terraindata.Tiles[this.Grid[index.row][index.column].tileIndex].elevationGrid();
        }
    }

    public cleanupElevationCache(whitelist: { row: number, column: number }[]): void {
        for (let row = 0; row < this.Grid.length; ++row) {
            for (let col = 0; col < this.Grid[row].length; ++col) {
                const idx = whitelist.findIndex((element) => element.column === col && element.row === row);
                if (idx === -1) {
                    this.Grid[row][col].elevationmap = undefined;
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

        if (this.Grid[index.row][index.column].tileIndex < 0 || this.Grid[index.row][index.column].tileIndex >= this.Terraindata.Tiles.length) {
            return undefined;
        }

        return this.Terraindata.Tiles[this.Grid[index.row][index.column].tileIndex];
    }

    public ndMap(id: string): { buffer: SharedArrayBuffer, rows: number, columns: number } {
        if (!(id in this.displays) || this.displays[id].renderer.ViewConfig.active === false) {
            return { buffer: undefined, rows: 0, columns: 0 };
        }
        return this.displays[id].map;
    }
}
