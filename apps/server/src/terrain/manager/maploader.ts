import { parentPort } from 'worker_threads';
import { ElevationGrid } from '../mapformat/elevationgrid';
import { TerrainMap } from '../mapformat/terrainmap';
import { Tile } from '../mapformat/tile';

let mapdata: TerrainMap = null;

function loadTiles(tileIndices: { row: number, column: number, tileIndex: number }[]) {
    const retval: { row: Number, column: Number, grid: ElevationGrid }[] = [];

    // load all missing tiles
    tileIndices.forEach((index) => {
        const map = Tile.loadElevationGrid(mapdata.Tiles[index.tileIndex]);
        retval.push({ row: index.row, column: index.column, grid: map });
    });

    return retval;
}

parentPort.on('message', (data: { type: string, instance: any }) => {
    if (data.type === 'MAP') {
        mapdata = data.instance as TerrainMap;
    } else if (data.type === 'TILES' && mapdata !== null) {
        parentPort.postMessage(
            loadTiles(data.instance as { row: number, column: number, tileIndex: number }[]),
        );
    }
});
