import { Terrainmap } from '../mapformat/terrainmap';

export class Worldmap {
    constructor(mapfile: Terrainmap) {
        const rowCount = Math.round(179 / mapfile.AngularSteps[0]);
        const colCount = Math.round(359 / mapfile.AngularSteps[1]);
        console.log(`Worldgrid: ${colCount}x${rowCount}`);
    }
}
