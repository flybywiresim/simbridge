import { normalizeHeading, projectWgs84 } from './helper';
import { rad2deg } from '../generic/helper';
import { LocalElevationMapParameters } from './interfaces';

export function createLocalElevationMap(
    this: LocalElevationMapParameters,
    latitude: number,
    longitude: number,
    heading: number,
    groundTruthLatitude: number,
    groundTruthLongitude: number,
    currentWorldGridX: number,
    currentWorldGridY: number,
    worldMap: number[][],
    worldMapWidth: number,
    worldMapHeight: number,
    worldMapSouthwestLat: number,
    worldMapSouthwestLong: number,
    worldMapNortheastLat: number,
    worldMapNortheastLong: number,
    ndWidth: number,
    ndHeight: number,
    meterPerPixel: number,
    arcMode: boolean,
): number {
    const centerX = ndWidth / 2.0;
    const delta = [this.thread.x - centerX, ndHeight - this.thread.y];
    if (this.thread.x >= ndWidth || this.thread.y >= ndHeight) return this.constants.invalidElevation;

    // calculate distance and bearing for the projection
    const distancePixels = Math.sqrt(delta[0] ** 2 + delta[1] ** 2);
    if (arcMode === true && distancePixels > ndHeight) return this.constants.invalidElevation;

    const distance = distancePixels * (meterPerPixel / 2.0);
    const angle = rad2deg(Math.acos(delta[1] / distancePixels));
    let bearing = 0.0;
    if (this.thread.x > centerX) {
        bearing = angle;
    } else {
        bearing = 360.0 - angle;
    }
    bearing = normalizeHeading(bearing + heading);

    const projected = projectWgs84(latitude, longitude, bearing, distance);
    let latStep = 0.0;
    if (worldMapSouthwestLat >= latitude) {
        // we are at the south pole
        latStep = worldMapSouthwestLat + worldMapNortheastLat + 180.0;
    } else if (worldMapNortheastLat <= latitude) {
        // we are at the north pole
        latStep = 180.0 - worldMapSouthwestLat - worldMapNortheastLat;
    } else {
        latStep = worldMapNortheastLat - worldMapSouthwestLat;
    }
    latStep /= worldMapHeight;

    // get the longitudinal step and check for 180 deg wrap arounds
    let longStep = 0.0;
    if (worldMapNortheastLong < worldMapSouthwestLong) {
        longStep = 180.0 - worldMapSouthwestLong + Math.abs(worldMapNortheastLong + 180.0);
    } else {
        longStep = worldMapNortheastLong - worldMapSouthwestLong;
    }
    longStep /= worldMapWidth;

    // calculate the pixel movement out of the current position
    const latPixelDelta = (groundTruthLatitude - projected[0]) / latStep;

    // calculate the pixel delta and check for wrap around situation at 180 deg
    let longPixelDelta = 0.0;
    if (Math.abs(projected[1] - groundTruthLongitude) >= 180.0) {
        if (projected[1] > groundTruthLatitude) {
            longPixelDelta = 180.0 - projected[1] + Math.abs(groundTruthLongitude) - 180.0;
        } else {
            longPixelDelta = 180.0 - groundTruthLongitude + Math.abs(projected[1]) - 180.0;
        }
    } else {
        longPixelDelta = projected[1] - groundTruthLongitude;
    }
    longPixelDelta /= longStep;

    const y = currentWorldGridY + latPixelDelta;
    const x = currentWorldGridX + longPixelDelta;
    if (y < 0 || y > worldMapHeight || x < 0 || x > worldMapWidth) return this.constants.unknownElevation;

    return worldMap[y][x];
}
