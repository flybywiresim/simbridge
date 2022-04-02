export class ElevationGrid {
    public Rows: number = 0;

    public Columns: number = 0;

    public Grid: number[][] | undefined = undefined;

    constructor(rows: number, columns: number, grid: number[][]) {
        this.Rows = rows;
        this.Columns = columns;
        this.Grid = grid;
    }
}
