import { ElevationGrid } from './elevationgrid';

export interface GridDefinition {
    rows: number,
    columns: number,
    latitudeStep: number,
    longitudeStep: number,
}

export interface TileData {
    row: number,
    column: number,
    grid: ElevationGrid,
}
