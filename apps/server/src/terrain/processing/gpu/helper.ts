import { deg2rad, rad2deg } from '../generic/helper';

export function normalizeHeading(angle: number): number {
    return (angle - (Math.floor(angle / 360.0) * 360.0));
}

export function projectWgs84(latitude: number, longitude: number, bearing: number, distance: number): [number, number] {
    const latRad = deg2rad(latitude);
    const longRad = deg2rad(longitude);
    const bearingRad = deg2rad(bearing);
    const ratio = distance / 6371010.0;

    let latDest = Math.asin(Math.sin(latRad) * Math.cos(ratio) + Math.cos(latRad) * Math.sin(ratio) * Math.cos(bearingRad));
    let longDest = longRad + Math.atan2(Math.sin(bearingRad) * Math.sin(ratio) * Math.cos(latRad), Math.cos(ratio) - Math.sin(latRad) * Math.sin(latDest));

    // ensure that the latitude is between [-90.0, 90.0]
    latDest = rad2deg(latDest);
    if (latDest < -90.0) latDest = -180.0 - latDest;
    if (latDest > 90.0) latDest = 180.0 - latDest;

    // ensure that the longitude is between [-180.0, 180.0]
    longDest = rad2deg(longDest);
    if (longDest < -180.0) longDest = 360.0 + longDest;
    if (longDest > 180.0) longDest -= 360.0;

    return [latDest, longDest];
}
