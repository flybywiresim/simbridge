export interface PositionData {
    latitude: number;
    longitude: number;
}

export enum TerrainRenderingMode {
    ArcMode = 0,
    VerticalMode = 1,
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
