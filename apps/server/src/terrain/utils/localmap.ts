import { TerrainLevelMode } from '../manager/navigationdisplaydata';

export class LocalMap {
    public ElevationMap: Int16Array = null;

    public LocalMapWidth: number = 0;

    public LocalMapHeight: number = 0;

    public RangeX: number[] = [10000, -10000];

    public RangeY: number[] = [10000, -10000];

    public DisplayPeaksMode: boolean = true;

    public MinimumElevation: number = 0;

    public MaximumElevation: number = 0;

    public AbsoluteCutOffAltitude: number = 0;

    public LowerDensityRangeThreshold: number = 0;

    public HigherDensityRangeThreshold: number = 0;

    public SolidDensityRangeThreshold: number = 0;

    public LowDensityGreenThreshold: number = 0;

    public HighDensityGreenThreshold: number = 0;

    public LowDensityYellowThreshold: number = 0;

    public HighDensityYellowThreshold: number = 0;

    public HighDensityRedThreshold: number = 0;

    public TerrainMapMinElevation: number = Infinity;

    public TerrainMapMaxElevation: number = Infinity;

    public TerrainMapMaxElevationMode: TerrainLevelMode = TerrainLevelMode.PeaksMode;

    public RenderedNonCriticalAreas: boolean = false;
}
