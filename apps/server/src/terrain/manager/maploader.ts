import { parentPort, workerData } from 'worker_threads';
import { ElevationGrid } from '../mapformat/elevationgrid';
import { Worldmap } from './worldmap';
import { Tile } from '../mapformat/tile';
import { PositionDto } from '../dto/position.dto';
import { WGS84 } from '../utils/wgs84';

function findTileIndices(world: Worldmap, latitude: number, longitude0: number, longitude1: number): { row: number, column: number }[] {
    const indices: { row: number, column: number }[] = [];

    for (let lon = longitude0; lon < longitude1; lon += world.Terraindata.AngularSteps.longitude) {
        const index = Worldmap.worldMapIndices(world, latitude, lon);
        if (index !== undefined && Worldmap.validTile(world, index) === true) {
            indices.push(index);
        }
    }

    return indices;
}

function loadTiles(world: Worldmap, position: PositionDto) {
    const southwest = WGS84.project(position.latitude, position.longitude, world.VisibilityRange * 1852, 225);
    const northeast = WGS84.project(position.latitude, position.longitude, world.VisibilityRange * 1852, 45);

    // wrap around at 180°
    let tileIndices: { row: number, column: number }[] = [];
    if (southwest.longitude > northeast.longitude) {
        for (let lat = southwest.latitude; lat < northeast.latitude; lat += world.Terraindata.AngularSteps.latitude) {
            tileIndices = tileIndices.concat(findTileIndices(world, lat, southwest.longitude, 180));
            tileIndices = tileIndices.concat(findTileIndices(world, lat, -180, northeast.longitude));
        }
    } else {
        for (let lat = southwest.latitude; lat < northeast.latitude; lat += world.Terraindata.AngularSteps.latitude) {
            tileIndices = tileIndices.concat(findTileIndices(world, lat, southwest.longitude, northeast.longitude));
        }
    }

    // load all missing tiles
    const retval: { row: Number, column: Number, grid: ElevationGrid }[] = [];
    tileIndices.forEach((index) => {
        if (Worldmap.validTile(world, index) === true && world.Grid[index.row][index.column].elevationmap === undefined) {
            const map = Tile.loadElevationGrid(world.Terraindata.Tiles[world.Grid[index.row][index.column].tileIndex]);
            map.ElevationMap = null;
            retval.push({ row: index.row, column: index.column, grid: map });
        }
    });

    return retval;
}

parentPort.postMessage(
    loadTiles(workerData.world, workerData.position),
);
