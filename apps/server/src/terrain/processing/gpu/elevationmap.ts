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
    const latStep = (worldMapNortheastLat - worldMapSouthwestLat) / worldMapHeight;
    const longStep = (worldMapNortheastLong - worldMapSouthwestLong) / worldMapWidth;

    // calculate the pixel movement out of the current position
    const latPixelDelta = (groundTruthLatitude - projected[0]) / latStep;
    const longPixelDelta = (projected[1] - groundTruthLongitude) / longStep;

    const y = currentWorldGridY + latPixelDelta;
    const x = currentWorldGridX + longPixelDelta;
    if (y < 0 || y > worldMapHeight || x < 0 || x > worldMapWidth) return this.constants.unknownElevation;

    return worldMap[y][x];
}
