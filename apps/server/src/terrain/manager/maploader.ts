// import { parentPort, workerData } from 'worker_threads';
import { Worldmap } from './worldmap';
import { Position } from '../dto/position.dto';

function project(latitude: number, longitude: number, distance: number, bearing: number): { latitude: number, longitude: number } {
    const earthRadius = 6371000;
    const lat1 = latitude * (Math.PI / 180);
    const lon1 = longitude * (Math.PI / 180);
    const brg = bearing * (Math.PI / 180);
    const ratio = distance / earthRadius;

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ratio) + Math.cos(lat1) * Math.sin(ratio) * Math.cos(brg));
    const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(ratio) * Math.cos(lat1), Math.cos(ratio) - Math.sin(lat1) * Math.sin(lat2));

    return { latitude: (lat2 * 180) / Math.PI, longitude: (lon2 * 180) / Math.PI };
}

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
    const southwest = project(position.latitude, position.longitude, world.VisibilityRange * 1852, 225);
    const northeast = project(position.latitude, position.longitude, world.VisibilityRange * 1852, 45);

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
