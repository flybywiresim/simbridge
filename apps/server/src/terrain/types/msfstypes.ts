export enum TerrainRenderingMode {
    ArcMode = 0,
    ScanlineMode = 1,
    VerticalDisplayRequired = 2,
}

export interface NavigationDisplay {
    range: number,
    arcMode: boolean,
    active: boolean,
    efisMode: number;
    mapOffsetX?: number,
    mapWidth?: number,
    mapHeight?: number,
}

export interface AircraftStatus {
    adiruDataValid: boolean,
    latitude: number,
    longitude: number,
    altitude: number,
    heading: number,
    verticalSpeed: number,
    gearIsDown: boolean,
    runwayDataValid: boolean,
    runwayLatitude: number,
    runwayLongitude: number,
    navigationDisplayCapt: NavigationDisplay,
    navigationDisplayFO: NavigationDisplay,
    navigationDisplayRenderingMode: TerrainRenderingMode,
}

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
