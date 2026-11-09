import {
  InvalidElevation,
  NauticalMilesToMetres,
  NavigationDisplayArcModeCenterOffsetYA380X,
  NavigationDisplayArcModePixelHeightA380X,
  NavigationDisplayMaxPixelWidth,
  UnknownElevation,
  WaterElevation,
} from './generic/constants';

// Nautical miles: preserve the VD's maximum forward range, with room for movement
// before rebuilding the detailed crop. Both NDs use the same geographic levels.
export const TerrainDetailRange = 160;
export const TerrainDetailMargin = 32;

// The A380X arc-mode ND is not cut off at the selected range: its top corners
// show terrain farther away, by this factor for the widest possible map.
const A380XArcModeRangePixels = NavigationDisplayArcModePixelHeightA380X - NavigationDisplayArcModeCenterOffsetYA380X;
const A380XArcModeCornerReach =
  Math.hypot(NavigationDisplayMaxPixelWidth / 2, A380XArcModeRangePixels) / A380XArcModeRangePixels;

/**
 * Nautical miles around the aircraft that are needed at full resolution, so that
 * an ND at TerrainDetailRange never mixes both resolutions in one picture.
 */
export function terrainDetailRange(a380x: boolean): number {
  return a380x ? Math.ceil(TerrainDetailRange * A380XArcModeCornerReach) : TerrainDetailRange;
}

// Original-grid coordinates: x, y, width, height. Bounds are exclusive at the far edge.
export type TerrainDetailBounds = [number, number, number, number];

/**
 * One reduced sample from a 2x2 cell. Missing samples must not silently become
 * known terrain, and land stays distinct from water, including land below sea
 * level at coastlines: unknown > invalid > highest land > water.
 */
function reduceCell(a: number, b: number, c: number, d: number): number {
  const ab = a > b ? a : b;
  const cd = c > d ? c : d;
  const maximum = ab > cd ? ab : cd;
  // Both missing-data markers are the largest Int16 values.
  if (maximum >= UnknownElevation) {
    return a === UnknownElevation || b === UnknownElevation || c === UnknownElevation || d === UnknownElevation
      ? UnknownElevation
      : InvalidElevation;
  }
  // Common case: land only, so the plain maximum is the peak.
  if (a !== WaterElevation && b !== WaterElevation && c !== WaterElevation && d !== WaterElevation) return maximum;

  let land = -32769;
  if (a !== WaterElevation) land = a;
  if (b !== WaterElevation && b > land) land = b;
  if (c !== WaterElevation && c > land) land = c;
  if (d !== WaterElevation && d > land) land = d;
  return land === -32769 ? WaterElevation : land;
}

/** Half each dimension, preserving peaks and explicit missing-data/water markers. */
export function reduceTerrain(data: Int16Array, width: number, height: number): Int16Array {
  const reducedWidth = Math.ceil(width / 2);
  const reduced = new Int16Array(reducedWidth * Math.ceil(height / 2));
  const pairedWidth = width - (width % 2);
  let target = 0;
  for (let y = 0; y < height; y += 2) {
    const upper = y * width;
    // A partial cell at an odd edge repeats its samples, which leaves the result unchanged.
    const lower = y + 1 < height ? upper + width : upper;
    for (let x = 0; x < pairedWidth; x += 2) {
      reduced[target++] = reduceCell(data[upper + x], data[upper + x + 1], data[lower + x], data[lower + x + 1]);
    }
    if (pairedWidth < width) {
      const top = data[upper + pairedWidth];
      const bottom = data[lower + pairedWidth];
      reduced[target++] = reduceCell(top, top, bottom, bottom);
    }
  }
  return reduced;
}

/** Bounding rectangle of a spherical distance cap in the original terrain grid. */
export function terrainDetailBounds(
  latitude: number,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  latitudeStep: number,
  longitudeStep: number,
  range: number,
): TerrainDetailBounds {
  const angular = (range * NauticalMilesToMetres) / 6371010;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const reachesPole = Math.abs(latitudeRadians) + angular >= Math.PI / 2;
  const longitudeSpan = reachesPole ? Math.PI : Math.asin(Math.sin(angular) / Math.cos(latitudeRadians));
  const radiusX = Math.ceil((longitudeSpan * 180) / Math.PI / longitudeStep) + 1;
  const radiusY = Math.ceil((angular * 180) / Math.PI / latitudeStep) + 1;
  const left = reachesPole ? 0 : Math.max(0, Math.min(width - 1, Math.floor(centerX - radiusX)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(centerY - radiusY)));
  const right = reachesPole ? width : Math.max(left + 1, Math.min(width, Math.ceil(centerX + radiusX) + 1));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil(centerY + radiusY) + 1));
  return [left, top, right - left, bottom - top];
}

export function containsTerrainBounds(outer: TerrainDetailBounds, inner: TerrainDetailBounds): boolean {
  return (
    outer !== null &&
    inner[0] >= outer[0] &&
    inner[1] >= outer[1] &&
    inner[0] + inner[2] <= outer[0] + outer[2] &&
    inner[1] + inner[3] <= outer[1] + outer[3]
  );
}

export function extractTerrainDetail(data: Int16Array, width: number, bounds: TerrainDetailBounds): Int16Array {
  const [x, y, detailWidth, detailHeight] = bounds;
  const detail = new Int16Array(detailWidth * detailHeight);
  for (let row = 0; row < detailHeight; row++) {
    const start = (y + row) * width + x;
    detail.set(data.subarray(start, start + detailWidth), row * detailWidth);
  }
  return detail;
}
