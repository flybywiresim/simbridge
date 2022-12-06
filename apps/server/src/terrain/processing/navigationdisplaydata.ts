export enum TerrainLevelMode {
    PeaksMode,
    Warning,
    Caution,
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
