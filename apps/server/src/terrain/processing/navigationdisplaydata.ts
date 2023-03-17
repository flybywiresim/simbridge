export enum TerrainLevelMode {
    PeaksMode = 0,
    Warning = 1,
    Caution = 2,
}

export class NavigationDisplayData {
    public MinimumElevation: number = Infinity;

    public MinimumElevationMode: TerrainLevelMode = TerrainLevelMode.PeaksMode;

    public MaximumElevation: number = Infinity;

    public MaximumElevationMode: TerrainLevelMode = TerrainLevelMode.PeaksMode;

    public FirstFrame: boolean = false;

    public DisplayRange: number = 10;

    public DisplayMode: number = 0;

    public FrameByteCount: number = 0;
}
