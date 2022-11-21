import { IKernelFunctionThis } from 'gpu.js';

export interface LocalElevationMapConstants {
    latitudeStepPerTile: number,
    longitudeStepPerTile: number,
    worldGridElementCount: number,
    invalidDataValue: number,
    invalidElevation: number,
    unknownElevation: number,
    waterElevation: number,
    gridRowIndex: number,
    gridColumnIndex: number,
    gridTileIndex: number,
    gridRowCount: number,
    gridColumnCount: number,
    gridEntryCount: number,
    flattenTileIndex: number,
    flattenTileOffset: number,
    flattenTileEntryCount: number,
}

export type LocalElevationMapParameters = {
    constants: LocalElevationMapConstants,
} & IKernelFunctionThis;

export interface HistogramConstants {
    minimumElevation: number,
    invalidElevation: number,
    unknownElevation: number,
    waterElevation: number,
    binRange: number,
    binCount: number,
    patchSize: number,
}

export type HistogramParameters = {
    constants: HistogramConstants,
} & IKernelFunctionThis;

export interface NavigationDisplayConstants {
    histogramBinRange: number,
    histogramMinElevation: number,
    histogramBinCount: number,
    lowerPercentile: number,
    upperPercentile: number,
    flatEarthThreshold: number,
    invalidElevation: number,
    unknownElevation: number,
    waterElevation: number,
    normalModeLowDensityGreenOffset: number,
    normalModeHighDensityGreenOffset: number,
    normalModeHighDensityYellowOffset: number,
    normalModeHighDensityRedOffset: number,
}

export type NavigationDisplayParameters = {
    constants: NavigationDisplayConstants,
} & IKernelFunctionThis;
