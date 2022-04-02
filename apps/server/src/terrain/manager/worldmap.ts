import { Terrainmap } from '../mapformat/terrainmap';
import { Tile } from '../mapformat/tile';
import { ElevationGrid } from '../mapformat/elevationgrid';
import { Configuration } from '../dto/configuration.dto';

export class Worldmap {
    private terrainmap: Terrainmap | undefined = undefined;

    private grid: { southwest: { latitude: number, longitude: number }, tileIndex: number, elevationmap: undefined | ElevationGrid }[][] = [];

    private visibilityRange: number = 250;

    private static findTileIndex(tiles: Tile[], latitude: number, longitude: number): number {
        for (let i = 0; i < tiles.length; ++i) {
            if (tiles[i].Southwest[0] === latitude && tiles[i].Southwest[1] === longitude) {
                return i;
            }
        }

        return -1;
    }

    constructor(mapfile: Terrainmap) {
        this.terrainmap = mapfile;

        for (let lat = -90; lat < 90; lat += mapfile.AngularSteps[0]) {
            this.grid.push([]);

            for (let lon = -180; lon < 180; lon += mapfile.AngularSteps[1]) {
                this.grid[this.grid.length - 1].push({
                    southwest: { latitude: lat, longitude: lon },
                    tileIndex: Worldmap.findTileIndex(mapfile.Tiles, lat, lon),
                    elevationmap: undefined,
                });
            }
        }
    }

    public configure(config: Configuration) {
        this.visibilityRange = config.visibilityRange;
    }

    }
}
