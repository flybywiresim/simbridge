export function deg2rad(degree: number): number {
    return degree * (Math.PI / 180.0);
}

export function rad2deg(radian: number): number {
    return radian * (180.0 / Math.PI);
}

export function distanceWgs84(latitude0: number, longitude0: number, latitude1: number, longitude1: number): number {
    const deltaLatitude = deg2rad(latitude1 - latitude0);
    const deltaLongitude = deg2rad(longitude1 - longitude0);
    const latitude0radian = deg2rad(latitude0);
    const latitude1radian = deg2rad(latitude1);

    const a = 0.5 - Math.cos(deltaLatitude) * 0.5
        + Math.cos(latitude0radian) * Math.cos(latitude1radian)
        * (1.0 - Math.cos(deltaLongitude)) * 0.5;

    const distanceMetres = 12742020.0 * Math.asin(Math.sqrt(a));
    return distanceMetres * 0.000539957;
}
