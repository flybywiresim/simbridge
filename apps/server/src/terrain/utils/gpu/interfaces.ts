import { IKernelFunctionThis } from 'gpu.js';

export interface LocalElevationMapConstants {
    angleStepPerTile: [number, number],
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
}

export type HistogramParameters = {
    constants: HistogramConstants,
} & IKernelFunctionThis;

export interface NavigationDisplayConstants {
    lowerPercentile: number,
    upperPercentile: number,
    histogramBinCount: number,
    histogramBinRange: number,
    histogramMinimumElevation: number,
    flatEarthThreshold: number,
}

export type NavigationDisplayParameters = {
    constants: NavigationDisplayConstants,
} & IKernelFunctionThis;
