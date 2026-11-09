import { IKernelFunctionThis } from 'gpu.js';

export type LocalElevationMapConstants = {
  unknownElevation: number;
  invalidElevation: number;
};

export type LocalElevationMapParameters = IKernelFunctionThis<LocalElevationMapConstants>;

export type ElevationProfileConstants = {
  unknownElevation: number;
  invalidElevation: number;
};

export type ElevationProfileParameters = IKernelFunctionThis<ElevationProfileConstants>;

export type HistogramConstants = {
  minimumElevation: number;
  invalidElevation: number;
  unknownElevation: number;
  waterElevation: number;
  binRange: number;
  binCount: number;
  patchSize: number;
};

export type HistogramParameters = IKernelFunctionThis<HistogramConstants>;

export type NavigationDisplayConstants = {
  histogramBinRange: number;
  histogramMinElevation: number;
  histogramBinCount: number;
  lowerPercentile: number;
  upperPercentile: number;
  flatEarthThreshold: number;
  invalidElevation: number;
  unknownElevation: number;
  waterElevation: number;
  normalModeLowDensityGreenOffset: number;
  normalModeHighDensityGreenOffset: number;
  normalModeHighDensityYellowOffset: number;
  normalModeHighDensityRedOffset: number;
  maxImageWidth: number;
  maxImageHeight: number;
  densityPatchSize: number;
  patternMapWidth: number;
  patternMapHeight: number;
};

export type NavigationDisplayParameters = IKernelFunctionThis<NavigationDisplayConstants>;

export type VerticalDisplayConstants = {
  elevationProfileEntryCount: number;
  invalidElevation: number;
  unknownElevation: number;
  waterElevation: number;
  maxImageHeight: number;
};

export type VerticalDisplayParameters = IKernelFunctionThis<VerticalDisplayConstants>;
