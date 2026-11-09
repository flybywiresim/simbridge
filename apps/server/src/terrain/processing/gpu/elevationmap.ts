import { normalizeHeading, projectWgs84, wgs84toPixelCoordinate } from './helper';
import { rad2deg } from '../generic/helper';
import { LocalElevationMapParameters } from './interfaces';
import { decodeTerrainElevation } from './terrainsampling';

export function createLocalElevationMap(
  this: LocalElevationMapParameters,
  latitude: number,
  longitude: number,
  heading: number,
  groundTruthLatitude: number,
  groundTruthLongitude: number,
  currentWorldGridX: number,
  currentWorldGridY: number,
  worldMap: number[][],
  worldMapWidth: number,
  worldMapHeight: number,
  worldMapSouthwestLat: number,
  worldMapSouthwestLong: number,
  worldMapNortheastLat: number,
  worldMapNortheastLong: number,
  ndWidth: number,
  ndHeight: number,
  meterPerPixel: number,
  arcMode: boolean,
  centerOffsetY: number,
  detailMap: number[][],
  // Detail crop in original-grid coordinates. Scalars stay uniforms; an array
  // argument would be uploaded as a texture and sampled on every read.
  detailLeft: number,
  detailTop: number,
  detailWidth: number,
  detailHeight: number,
): number {
  const centerX = ndWidth / 2.0;
  const delta = [this.thread.x - centerX, ndHeight - this.thread.y - centerOffsetY];
  if (this.thread.x >= ndWidth || this.thread.y >= ndHeight) return this.constants.invalidElevation;

  // calculate distance and bearing for the projection
  const distancePixels = Math.sqrt(delta[0] ** 2 + delta[1] ** 2);
  // Cut off ARC shape when in A32NX and arc mode
  if (centerOffsetY === 0 && arcMode === true && distancePixels > ndHeight) return this.constants.invalidElevation;

  const distance = distancePixels * (meterPerPixel / 2.0);
  const angle = rad2deg(Math.acos(delta[1] / distancePixels));
  let bearing = 0.0;
  if (this.thread.x > centerX) {
    bearing = angle;
  } else {
    bearing = 360.0 - angle;
  }
  bearing = normalizeHeading(bearing + heading);

  const projected = projectWgs84(latitude, longitude, bearing, distance);
  const pixel = wgs84toPixelCoordinate(
    latitude,
    projected[0],
    projected[1],
    groundTruthLatitude,
    groundTruthLongitude,
    worldMapSouthwestLat,
    worldMapSouthwestLong,
    worldMapNortheastLat,
    worldMapNortheastLong,
    worldMapWidth,
    worldMapHeight,
    currentWorldGridX,
    currentWorldGridY,
  );

  if (pixel[1] < 0 || pixel[1] >= worldMapHeight || pixel[0] < 0 || pixel[0] >= worldMapWidth)
    return this.constants.unknownElevation;

  if (
    pixel[0] >= detailLeft &&
    pixel[1] >= detailTop &&
    pixel[0] < detailLeft + detailWidth &&
    pixel[1] < detailTop + detailHeight
  ) {
    const x = pixel[0] - detailLeft;
    const y = pixel[1] - detailTop;
    if (!this.constants.packedTerrain) return detailMap[y][x];
    return decodeTerrainElevation(detailMap[y][x * 2], detailMap[y][x * 2 + 1]);
  }
  const coarseX = Math.floor(pixel[0] / 2);
  const coarseY = Math.floor(pixel[1] / 2);
  if (!this.constants.packedTerrain) return worldMap[coarseY][coarseX];
  return decodeTerrainElevation(worldMap[coarseY][coarseX * 2], worldMap[coarseY][coarseX * 2 + 1]);
}
