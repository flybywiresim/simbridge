export enum TerrainLevelMode {
    PeaksMode = 0,
    Warning = 1,
    Caution = 2,
}

export class NavigationDisplayData {
    public Timestamp: number = 0;

    public Rows: number = 0;

    public Columns: number = 0;

    public MinimumElevation: number = Infinity;

    public MinimumElevationMode: TerrainLevelMode = TerrainLevelMode.PeaksMode;

    public MaximumElevation: number = Infinity;

    public MaximumElevationMode: TerrainLevelMode = TerrainLevelMode.PeaksMode;
}
