import { deg2rad, rad2deg } from '../generic/helper';

export function normalizeHeading(angle: number): number {
    return (angle - (Math.floor(angle / 360.0) * 360.0));
}

export function projectWgs84(latitude: number, longitude: number, bearing: number, distance: number): [number, number] {
    const latRad = deg2rad(latitude);
    const longRad = deg2rad(longitude);
    const bearingRad = deg2rad(bearing);
    const ratio = distance / 6371010.0;

    const latDest = Math.asin(Math.sin(latRad) * Math.cos(ratio) + Math.cos(latRad) * Math.sin(ratio) * Math.cos(bearingRad));
    const longDest = longRad + Math.atan2(Math.sin(bearingRad) * Math.sin(ratio) * Math.cos(latRad), Math.cos(ratio) - Math.sin(latRad) * Math.sin(latDest));

    return [rad2deg(latDest), rad2deg(longDest)];
}
