// import { parentPort, workerData } from 'worker_threads';
import { Worldmap } from './worldmap';
import { Position } from '../dto/position.dto';
import { WGS84 } from '../utils/wgs84';

function findTileIndices(world: Worldmap, latitude: number, longitude0: number, longitude1: number): { row: number, column: number }[] {
    const indices: { row: number, column: number }[] = [];

    for (let lon = longitude0; lon < longitude1; lon += world.Terraindata.AngularSteps.longitude) {
        const index = world.worldMapIndices(latitude, lon);
        if (index !== undefined && world.validTile(index) === true) {
            indices.push(index);
        }
    }

    return indices;
}

export function loadTiles(world: Worldmap, position: Position) {
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

    const start = new Date().getTime();
    // load all missing tiles
    tileIndices.forEach((index) => world.loadElevationMap(index));
    const delta = new Date().getTime() - start;
    console.log(`Processed: ${delta / 1000}`);

    world.cleanupElevationCache(tileIndices);
}

// parentPort.postMessage(loadTiles(workerData.worldmap, workerData.position));
