export class LocalMap {
    public ElevationMap: Int16Array = null;

    public MinimumElevation: number = 0;

    public MaximumElevation: number = 0;

    public ElevationPercentile85th: number = 0;

    public ElevationPercentile95th: number = 0;

    public LowerDensityRangeThreshold: number = 0;

    public HigherDensityRangeThreshold: number = 0;

    public SolidDensityRangeThreshold: number = 0;

    public TerrainMapMinElevation: number = Infinity;

    public TerrainMapMaxElevation: number = Infinity;
}
