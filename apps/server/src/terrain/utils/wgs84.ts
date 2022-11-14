export class WGS84 {
    private static Degree2Radian = 0.017453292519943295;

    private static EarthDiameter = 12742020;

    private static EarthRadius = 6371010;

    /*
     * Calculates the great circle distance (nautical miles) between two coordinates
     * Implementation of the Haversine formula
     */
    public static distance(latitude0: number, longitude0: number, latitude1: number, longitude1: number): number {
        const deltaLatitude = (latitude1 - latitude0) * WGS84.Degree2Radian;
        const deltaLongitude = (longitude1 - longitude0) * WGS84.Degree2Radian;

        const a = 0.5 - Math.cos(deltaLatitude) * 0.5
            + Math.cos(latitude0 * WGS84.Degree2Radian) * Math.cos(latitude1 * WGS84.Degree2Radian)
            * (1.0 - Math.cos(deltaLongitude)) * 0.5;

        const distanceMetres = WGS84.EarthDiameter * Math.asin(Math.sqrt(a));
        return distanceMetres * 0.000539957;
    }

    /*
     * Projects a coordinate based on distance and bearing.
     * The distance has to be defined in metres
     */
    public static project(latitude: number, longitude: number, distance: number, bearing: number): { latitude: number, longitude: number } {
        const lat1 = latitude * (Math.PI / 180);
        const lon1 = longitude * (Math.PI / 180);
        const brg = bearing * (Math.PI / 180);
        const ratio = distance / WGS84.EarthRadius;

        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ratio) + Math.cos(lat1) * Math.sin(ratio) * Math.cos(brg));
        const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(ratio) * Math.cos(lat1), Math.cos(ratio) - Math.sin(lat1) * Math.sin(lat2));

        return { latitude: (lat2 * 180) / Math.PI, longitude: (lon2 * 180) / Math.PI };
    }
}
