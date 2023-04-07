import { IKernelFunctionThis } from 'gpu.js';

export interface LocalElevationMapConstants {
    unknownElevation: number,
    invalidElevation: number,
}

export type LocalElevationMapParameters = {
    constants: LocalElevationMapConstants,
} & IKernelFunctionThis;

export interface ElevationProfileConstants {
    unknownElevation: number,
    invalidElevation: number,
}

export type ElevationProfileParameters = {
    constants: ElevationProfileConstants,
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
    maxImageWidth: number,
    maxImageHeight: number,
    densityPatchSize: number,
    patternMapWidth: number,
    patternMapHeight: number,
}

export type NavigationDisplayParameters = {
    constants: NavigationDisplayConstants,
} & IKernelFunctionThis;

export interface VerticalDisplayConstants {
    elevationProfileEntryCount: number,
    invalidElevation: number,
    unknownElevation: number,
    waterElevation: number,
    maxImageHeight: number,
}

export type VerticalDisplayParameters = {
    constants: VerticalDisplayConstants,
} & IKernelFunctionThis;
