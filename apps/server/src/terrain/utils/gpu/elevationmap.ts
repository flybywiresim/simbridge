import {
    coordinate2gridIndex,
    coordinate2worldIndex,
    findTileInformation,
    findTileOffset,
    normalizeHeading,
    projectWgs84,
    rad2deg,
} from './helper';
import { LocalElevationMapConstants, LocalElevationMapParameters } from './interfaces';

export function extractElevation(
    constants: LocalElevationMapConstants,
    latitude: number,
    longitude: number,
    worldGridData: number[],
    tilesCount: number,
    tilesMetadata: number[],
    tilesBuffer: number[],
    tilesBufferLength: number,
): number {
    const worldIndex = coordinate2worldIndex(
        latitude,
        longitude,
        constants.latitudeStepPerTile,
        constants.longitudeStepPerTile,
    );

    const tileInformation = findTileInformation(
        constants.gridEntryCount,
        constants.gridRowIndex,
        constants.gridColumnIndex,
        constants.gridTileIndex,
        constants.gridRowCount,
        constants.gridColumnCount,
        worldIndex[0],
        worldIndex[1],
        worldGridData,
        constants.worldGridElementCount,
        constants.waterElevation,
    );

    if (tileInformation[0] === constants.waterElevation) {
        return constants.waterElevation;
    }
    if (tileInformation[1] === constants.invalidDataValue || tileInformation[2] < constants.invalidDataValue) {
        return constants.unknownElevation;
    }

    const gridIndex = coordinate2gridIndex(
        latitude,
        longitude,
        worldIndex[0],
        worldIndex[1],
        constants.latitudeStepPerTile,
        constants.longitudeStepPerTile,
        tileInformation[1],
        tileInformation[2],
    );

    const tileOffset = findTileOffset(
        tileInformation[0],
        tilesCount,
        tilesMetadata,
        constants.flattenTileIndex,
        constants.flattenTileOffset,
        constants.flattenTileEntryCount,
    );

    if (tileOffset < 0) {
        return constants.invalidElevation;
    }

    const elevationIndex = gridIndex[0] * tileInformation[2] + gridIndex[1];
    if (tilesBufferLength <= tileOffset + elevationIndex) {
        return constants.invalidElevation;
    }

    return tilesBuffer[tileOffset + elevationIndex];
}

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
    const pixelY = Math.floor(this.thread.x / mapDimension[0]);
    const pixelX = this.thread.x % mapDimension[0];

    const centerX = mapDimension[0] / 2.0;
    const delta = [pixelX - centerX, mapDimension[1] - pixelY];

    // calculate distance and bearing for the projection
    const distancePixels = Math.sqrt(delta[0] ** 2 + delta[1] ** 2);
    const distance = distancePixels * (meterPerPixel / 2.0);
    const angle = rad2deg(Math.acos(delta[1] / distancePixels));
    let bearing = 0.0;
    if (pixelX > centerX) {
        bearing = angle;
    } else {
        bearing = 360.0 - angle;
    }
    bearing = normalizeHeading(bearing + heading);

    const projected = projectWgs84(latitude, longitude, bearing, distance);

    const worldIndex = coordinate2worldIndex(
        projected[0],
        projected[1],
        this.constants.latitudeStepPerTile,
        this.constants.longitudeStepPerTile,
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
        this.constants.latitudeStepPerTile,
        this.constants.longitudeStepPerTile,
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
