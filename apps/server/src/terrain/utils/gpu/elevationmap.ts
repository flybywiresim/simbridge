import {
    coordinate2gridIndex,
    coordinate2worldIndex,
    findTileInformation,
    findTileOffset,
    normalizeHeading,
    projectWgs84,
    rad2deg,
} from './helper';
import { LocalElevationMapParameters } from './interfaces';

export function createLocalElevationMap(
    this: LocalElevationMapParameters,
    latitude: number,
    longitude: number,
    heading: number,
    mapDimension: [number, number],
    meterPerPixel: number,
    worldGridData: number[],
    tilesCount: number,
    tilesMetadata: number[],
    tilesBuffer: number[],
    tilesBufferLength: number,
): number {
    const centerX = mapDimension[0] / 2.0;
    const delta = [this.thread.x - centerX, mapDimension[1] - this.thread.y];

    // calculate distance and bearing for the projection
    const distancePixels = Math.sqrt(delta[0] ** 2 + delta[1] ** 2);
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

    const worldIndex = coordinate2worldIndex(
        projected[0],
        projected[1],
        this.constants.angleStepPerTile[0],
        this.constants.angleStepPerTile[1],
    );

    const tileInformation = findTileInformation(
        this.constants.gridEntryCount,
        this.constants.gridRowIndex,
        this.constants.gridColumnIndex,
        this.constants.gridTileIndex,
        this.constants.gridRowCount,
        this.constants.gridColumnCount,
        worldIndex[0],
        worldIndex[1],
        worldGridData,
        this.constants.worldGridElementCount,
        this.constants.waterElevation,
    );

    if (tileInformation[0] === this.constants.waterElevation) {
        return this.constants.waterElevation;
    }
    if (tileInformation[1] === this.constants.invalidDataValue || tileInformation[2] < this.constants.invalidDataValue) {
        return this.constants.unknownElevation;
    }

    const gridIndex = coordinate2gridIndex(
        projected[0],
        projected[1],
        worldIndex[0],
        worldIndex[1],
        this.constants.angleStepPerTile[0],
        this.constants.angleStepPerTile[1],
        tileInformation[1],
        tileInformation[2],
    );

    const tileOffset = findTileOffset(
        tileInformation[0],
        tilesCount,
        tilesMetadata,
        this.constants.flattenTileIndex,
        this.constants.flattenTileOffset,
        this.constants.flattenTileEntryCount,
    );

    if (tileOffset < 0) {
        return this.constants.invalidElevation;
    }

    const elevationIndex = gridIndex[0] * tileInformation[2] + gridIndex[1];
    if (tilesBufferLength <= tileOffset + elevationIndex) {
        return this.constants.invalidElevation;
    }

    return tilesBuffer[tileOffset + elevationIndex];
}
