import { Terrainmap } from '../mapformat/terrainmap';
import { Configuration } from '../dto/configuration.dto';

export class Worldmap {
    private terrainmap: Terrainmap | undefined = undefined;

    private grid: { southwest: { latitude: number, longitude: number }, tileIndex: number, elevationmap: undefined | ElevationGrid }[][] = [];

    private visibilityRange: number = 250;

    constructor(mapfile: Terrainmap) {
    public configure(config: Configuration) {
        this.visibilityRange = config.visibilityRange;
    }

    }
}
