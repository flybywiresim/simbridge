import { IKernelFunctionThis } from 'gpu.js';

export interface LocalElevationMapConstants {
    unknownElevation: number,
    invalidElevation: number,
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
    densityPatchSize: number,
}

export type NavigationDisplayParameters = {
    constants: NavigationDisplayConstants,
} & IKernelFunctionThis;
