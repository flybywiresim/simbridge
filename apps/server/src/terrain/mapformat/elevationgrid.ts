export class ElevationGrid {
    private southwest: { latitude: number, longitude: number } = { latitude: 0, longitude: 0 };

    private northeast: { latitude: number, longitude: number } = { latitude: 0, longitude: 0 };

    public Rows: number = 0;

    public Columns: number = 0;

    public Grid: SharedArrayBuffer | undefined = undefined;

    public ElevationMap: Int16Array | undefined = undefined;

    public MapLoaded: boolean = false;

    constructor(southwest: { latitude: number, longitude: number }, northeast: { latitude: number, longitude: number }, rows: number, columns: number) {
        this.southwest = southwest;
        this.northeast = northeast;
        this.Rows = rows;
        this.Columns = columns;

        this.Grid = new SharedArrayBuffer(rows * columns * 2);
        this.ElevationMap = new Int16Array(this.Grid);
    }

    public static worldToGridIndices(grid: ElevationGrid, coordinate: { latitude: number, longitude: number }): { row: number, column: number } {
        const latRange = grid.northeast.latitude - grid.southwest.latitude;
        const latDelta = coordinate.latitude - grid.southwest.latitude;
        const row = Math.min(grid.Rows - Math.floor((latDelta / latRange) * grid.Rows), grid.Rows) - 1;

        const lonRange = grid.northeast.longitude - grid.southwest.longitude;
        const lonDelta = coordinate.longitude - grid.southwest.longitude;
        const column = Math.min(Math.floor((lonDelta / lonRange) * grid.Columns), grid.Columns - 1);

        return { row, column };
    }
}
