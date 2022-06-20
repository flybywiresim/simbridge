export class WGS84 {
    public static project(latitude: number, longitude: number, distance: number, bearing: number): { latitude: number, longitude: number } {
        const earthRadius = 6371010;
        const lat1 = latitude * (Math.PI / 180);
        const lon1 = longitude * (Math.PI / 180);
        const brg = bearing * (Math.PI / 180);
        const ratio = distance / earthRadius;

        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ratio) + Math.cos(lat1) * Math.sin(ratio) * Math.cos(brg));
        const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(ratio) * Math.cos(lat1), Math.cos(ratio) - Math.sin(lat1) * Math.sin(lat2));

        return { latitude: (lat2 * 180) / Math.PI, longitude: (lon2 * 180) / Math.PI };
    }
}
