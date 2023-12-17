import { ElevationGrid } from './elevationgrid';

export interface GridDefinition {
  rows: number;
  columns: number;
  latitudeStep: number;
  longitudeStep: number;
}

export interface TileData {
  row: number;
  column: number;
  grid: ElevationGrid;
}

export interface GridLookupData {
  southwest: { latitude: number; longitude: number };
  northeast: { latitude: number; longitude: number };
  grid: { row: number; column: number }[][];
  minWidthPerTile: number;
  minHeightPerTile: number;
}
