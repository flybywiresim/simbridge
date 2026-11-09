// disable the destructuring because of GPU.JS
/* eslint-disable prefer-destructuring */
import { bearingWgs84, projectWgs84, wgs84toPixelCoordinate } from './helper';
import { distanceWgs84 } from '../generic/helper';
import { ElevationProfileParameters } from './interfaces';
import { decodeTerrainElevation } from './terrainsampling';

export function createElevationProfile(
  this: ElevationProfileParameters,
  latitude: number,
  longitude: number,
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
  pathOffset: number,
  waypointsLatitudes: number[],
  waypointsLongitudes: number[],
  waypointsPointCount: number,
  distancePerPixel: number,
  detailMap: number[][],
  detailBounds: number[],
): number {
  const distanceForPixel = distancePerPixel * this.thread.x;
  let routeSegmentIndex = waypointsPointCount;
  let routeStartPointDistance = 0.0;
  let startLatitude = latitude;
  let startLongitude = longitude;

  // find the correct starting point
  for (let i = 0; i < waypointsPointCount; ++i) {
    const currentDistance = distanceWgs84(startLatitude, startLongitude, waypointsLatitudes[i], waypointsLongitudes[i]);
    if (routeStartPointDistance + currentDistance >= distanceForPixel) {
      routeSegmentIndex = i;
      break;
    }

    routeStartPointDistance += currentDistance;
    startLatitude = waypointsLatitudes[i];
    startLongitude = waypointsLongitudes[i];
  }

  // check if we exceeded the points
  if (routeSegmentIndex >= waypointsPointCount) {
    return this.constants.invalidElevation;
  }

  // get the required projection of latitude, longitude
  const remainingDistance = (distanceForPixel - routeStartPointDistance) * 1852.0;
  const bearing = bearingWgs84(
    startLatitude,
    startLongitude,
    waypointsLatitudes[routeSegmentIndex],
    waypointsLongitudes[routeSegmentIndex],
  );
  const centerPosition = projectWgs84(startLatitude, startLongitude, bearing, remainingDistance);

  /*
   * The VD uses a hose along the fly-path or route and uses the maximum elevation inside the hose for the visualization.
   * Therefore are orthogonal points at the centerPosition required (left and right of track) to define a sampling line
   * to find the maximum elevation. The startPixel and endPixel define the endpoints of the line
   */
  let bearingStart = bearing - 90.0;
  if (bearingStart < 0.0) bearingStart += 360.0;
  let bearingEnd = bearing + 90.0;
  if (bearingEnd >= 360.0) bearingEnd -= 360.0;
  const offsetMeters = (pathOffset * 1852.0) / 2; // pathOffset is passed as full width of corridor

  const startProjected = projectWgs84(centerPosition[0], centerPosition[1], bearingStart, offsetMeters);
  const startPixel = wgs84toPixelCoordinate(
    latitude,
    startProjected[0],
    startProjected[1],
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
  const endProjected = projectWgs84(centerPosition[0], centerPosition[1], bearingEnd, offsetMeters);
  const endPixel = wgs84toPixelCoordinate(
    latitude,
    endProjected[0],
    endProjected[1],
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

  /*
   * Use a modified Bresenham line algorithm to sample the line along the world map pixels
   */
  const deltaX = Math.abs(endPixel[0] - startPixel[0]);
  const stepX = startPixel[0] < endPixel[0] ? 1 : -1;
  const deltaY = -1.0 * Math.abs(endPixel[1] - startPixel[1]);
  const stepY = startPixel[1] < endPixel[1] ? 1 : -1;
  let error = deltaX + deltaY;
  let maxElevation = -1000;
  let x = startPixel[0];
  let y = startPixel[1];

  while (true) {
    if (y >= 0 && y < worldMapHeight && x >= 0 && x < worldMapWidth) {
      let elevation = 0;
      if (
        x >= detailBounds[0] &&
        y >= detailBounds[1] &&
        x < detailBounds[0] + detailBounds[2] &&
        y < detailBounds[1] + detailBounds[3]
      ) {
        const detailX = x - detailBounds[0];
        const detailY = y - detailBounds[1];
        elevation = this.constants.packedTerrain
          ? decodeTerrainElevation(detailMap[detailY][detailX * 2], detailMap[detailY][detailX * 2 + 1])
          : detailMap[detailY][detailX];
      } else {
        const coarseX = Math.floor(x / 2);
        const coarseY = Math.floor(y / 2);
        elevation = this.constants.packedTerrain
          ? decodeTerrainElevation(worldMap[coarseY][coarseX * 2], worldMap[coarseY][coarseX * 2 + 1])
          : worldMap[coarseY][coarseX];
      }
      if (
        elevation !== this.constants.invalidElevation &&
        elevation !== this.constants.unknownElevation &&
        elevation > maxElevation
      ) {
        maxElevation = elevation;
      }
    }

    if (x === endPixel[0] && y === endPixel[1]) break;

    const errorDouble = 2.0 * error;
    if (errorDouble >= deltaY) {
      if (x === endPixel[0]) break;
      error += deltaY;
      x += stepX;
    }
    if (errorDouble <= deltaX) {
      if (y === endPixel[1]) break;
      error += deltaX;
      y += stepY;
    }
  }

  return maxElevation;
}
