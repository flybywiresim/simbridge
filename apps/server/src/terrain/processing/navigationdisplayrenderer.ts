import { GPU, IKernelRunShortcut, KernelOutput, Texture } from 'gpu.js';
import {
  FeetPerNauticalMile,
  GpuProcessingActive,
  InvalidElevation,
  NavigationDisplayArcModeCenterOffsetYA380X,
  NavigationDisplayArcModePixelHeightA32NX,
  NavigationDisplayArcModePixelHeightA380X,
  NavigationDisplayCenterOffsetYA32NX,
  NavigationDisplayMaxPixelHeight,
  NavigationDisplayMaxPixelWidth,
  NavigationDisplayRoseModeCenterOffsetYA380X,
  NavigationDisplayRoseModePixelHeightA32NX,
  NavigationDisplayRoseModePixelHeightA380X,
  RenderingColorChannelCount,
  RenderingMapFrameValidityTimeArcMode,
  TerrainDiagnosticsEnabled,
  RenderingMapFrameValidityTimeScanlineMode,
  RenderingMapTransitionDeltaTime,
  RenderingMapTransitionDurationArcMode,
  RenderingMapTransitionDurationScanlineMode,
  ThreeNauticalMilesInFeet,
  UnknownElevation,
  WaterElevation,
} from './generic/constants';
import { distanceWgs84 } from './generic/helper';
import { HistogramConstants, NavigationDisplayConstants } from './gpu/interfaces';
import {
  calculateNormalModeGreenThresholds,
  calculateNormalModeWarningThresholds,
  calculatePeaksModeThresholds,
  drawDensityPixel,
  renderNavigationDisplay,
  renderNormalMode,
  renderPeaksMode,
} from './gpu/rendering/navigationdisplay';
import { createArcModePatternMap, createScanlineModePatternMap } from './gpu/patterns';
import { createElevationHistogram, createLocalElevationHistogram } from './gpu/statistics';
import { uploadTextureData } from './gpu/upload';
import { Logger } from './logging/logger';
import { MapHandler } from './maphandler';
import {
  AircraftStatus,
  DisplaySide,
  EfisData,
  NavigationDisplayData,
  TerrainLevelMode,
  TerrainRenderingMode,
} from '../types';

// histogram parameters
const HistogramBinRange = 100;
const HistogramMinimumElevation = -500; // some areas in the world are below water level
const HistogramMaximumElevation = 29040; // mount everest
const HistogramBinCount = Math.ceil((HistogramMaximumElevation - HistogramMinimumElevation + 1) / HistogramBinRange);
const HistogramPatchSize = 256;

// rendering parameters
const RenderingArcModePixelWidth = 756;
const RenderingRoseModePixelWidth = 678;
const RenderingCutOffAltitudeMinimimum = 200;
const RenderingCutOffAltitudeMaximum = 400;
const RenderingLowerPercentile = 0.85;
const RenderingUpperPercentile = 0.95;
const RenderingFlatEarthThreshold = 100;
const RenderingMaxAirportDistance = 4.0;
const RenderingNormalModeLowDensityGreenOffset = 2000;
const RenderingNormalModeHighDensityGreenOffset = 1000;
const RenderingNormalModeHighDensityYellowOffset = 1000;
const RenderingNormalModeHighDensityRedOffset = 2000;
const RenderingGearDownOffset = 250;
const RenderingNonGearDownOffset = 500;
const RenderingDensityPatchSize = 13;
const RenderingMapTransitionAngularStep = Math.round(
  (90 / RenderingMapTransitionDurationArcMode) * RenderingMapTransitionDeltaTime,
);

export class NavigationDisplayRenderer {
  private configuration: EfisData = null;

  private patternUpload: IKernelRunShortcut = null;

  private pixelPattern: Texture = null;

  private localHistogram: IKernelRunShortcut = null;

  private histogram: IKernelRunShortcut = null;

  private renderer: IKernelRunShortcut = null;

  private aircraftStatus: AircraftStatus = null;

  /**
   * Cached per-pixel angles from the display's bottom-center, indexed by pixel.
   * Rebuilt only when the display dimensions change.
   */
  private angleMapCache: { width: number; height: number; angles: Float32Array } | null = null;

  private renderingData: {
    startTransitionBorder: number;
    currentTransitionBorder: number;
    frameCounter: number;
    thresholdData: NavigationDisplayData;
    finalFrame: Uint8ClampedArray;
    lastFrame: Uint8ClampedArray;
    currentFrame: Uint8ClampedArray;
    frameValidityDuration: number;
    forceFullSweep: boolean;
  } = {
    startTransitionBorder: 0,
    currentTransitionBorder: 0,
    frameCounter: 0,
    thresholdData: null,
    finalFrame: null,
    lastFrame: null,
    currentFrame: null,
    frameValidityDuration: 1000,
    forceFullSweep: false,
  };

  // transition frames are rebuilt every RenderingMapTransitionDeltaTime (40ms); allocating
  // a fresh ~1.5MB array per tick per side is the single largest source of GC pressure in
  // the render loop. Two buffers, because a transition reads lastFrame while writing the
  // next one — acquireTransitionBuffer() always hands back the one lastFrame is not using.
  private transitionBuffers: [Uint8ClampedArray, Uint8ClampedArray] = [null, null];

  private lastThresholdReport = 0;

  private acquireTransitionBuffer(length: number): Uint8ClampedArray {
    const free = this.transitionBuffers[0] === this.renderingData.lastFrame ? 1 : 0;
    if (this.transitionBuffers[free] === null || this.transitionBuffers[free].length !== length) {
      this.transitionBuffers[free] = new Uint8ClampedArray(length);
    }
    return this.transitionBuffers[free];
  }

  constructor(
    private readonly maphandler: MapHandler,
    private logging: Logger,
    private readonly gpu: GPU,
    private readonly startupTime: number,
  ) {
    this.patternUpload = this.gpu
      .createKernel(uploadTextureData, {
        argumentTypes: { texture: 'Array', width: 'Integer' },
        dynamicArguments: true,
        dynamicOutput: false,
        pipeline: true,
        immutable: false,
        tactic: 'speed',
      })
      .setOutput([NavigationDisplayMaxPixelWidth, NavigationDisplayMaxPixelHeight]);

    this.localHistogram = this.gpu
      .createKernel(createLocalElevationHistogram, {
        dynamicArguments: true,
        dynamicOutput: true,
        pipeline: true,
        immutable: false,
      })
      .setLoopMaxIterations(1000)
      .setConstants<HistogramConstants>({
        minimumElevation: HistogramMinimumElevation,
        invalidElevation: InvalidElevation,
        unknownElevation: UnknownElevation,
        waterElevation: WaterElevation,
        binRange: HistogramBinRange,
        binCount: HistogramBinCount,
        patchSize: HistogramPatchSize,
      });

    this.histogram = this.gpu
      .createKernel(createElevationHistogram, {
        dynamicArguments: true,
        pipeline: true,
        immutable: false,
      })
      .setLoopMaxIterations(500)
      .setOutput([HistogramBinCount]);

    this.renderer = this.gpu
      .createKernel(renderNavigationDisplay, {
        dynamicArguments: true,
        dynamicOutput: true,
        pipeline: false,
        immutable: false,
      })
      .setConstants<NavigationDisplayConstants>({
        histogramBinRange: HistogramBinRange,
        histogramMinElevation: HistogramMinimumElevation,
        histogramBinCount: HistogramBinCount,
        lowerPercentile: RenderingLowerPercentile,
        upperPercentile: RenderingUpperPercentile,
        flatEarthThreshold: RenderingFlatEarthThreshold,
        invalidElevation: InvalidElevation,
        unknownElevation: UnknownElevation,
        waterElevation: WaterElevation,
        normalModeLowDensityGreenOffset: RenderingNormalModeLowDensityGreenOffset,
        normalModeHighDensityGreenOffset: RenderingNormalModeHighDensityGreenOffset,
        normalModeHighDensityYellowOffset: RenderingNormalModeHighDensityYellowOffset,
        normalModeHighDensityRedOffset: RenderingNormalModeHighDensityRedOffset,
        maxImageWidth: NavigationDisplayMaxPixelWidth,
        maxImageHeight: NavigationDisplayMaxPixelHeight,
        densityPatchSize: RenderingDensityPatchSize,
        patternMapWidth: NavigationDisplayMaxPixelWidth,
        patternMapHeight: NavigationDisplayMaxPixelHeight,
      })
      .setFunctions([
        calculateNormalModeGreenThresholds,
        calculateNormalModeWarningThresholds,
        calculatePeaksModeThresholds,
        renderNormalMode,
        renderPeaksMode,
        drawDensityPixel,
      ]);
  }

  public shutdown(): void {
    // pixelPattern belongs to patternUpload — destroying the kernel releases it
    this.pixelPattern = null;
    this.patternUpload.destroy();
    this.localHistogram.destroy();
    this.histogram.destroy();
    this.renderer.destroy();
  }

  public async initialize(): Promise<boolean> {
    this.startNewMapCycle(this.startupTime);
    return true;
  }

  private configureNavigationDisplay(config: EfisData): void {
    const lastConfig = this.configuration;
    const configChanged =
      lastConfig !== null &&
      (lastConfig.efisMode !== config.efisMode ||
        lastConfig.ndRange !== config.ndRange ||
        lastConfig.arcMode !== config.arcMode ||
        lastConfig.terrOnNd !== config.terrOnNd ||
        lastConfig.terrOnVd !== config.terrOnVd);
    const stopRendering =
      lastConfig !== null && ((lastConfig.terrOnNd && !config.terrOnNd) || (lastConfig.terrOnVd && !config.terrOnVd));
    const startRendering = configChanged || (lastConfig === null && config !== null);

    this.configuration = config;
    if (lastConfig !== null) {
      this.configuration.mapWidth = lastConfig.mapWidth;
      this.configuration.mapHeight = lastConfig.mapHeight;
      this.configuration.mapOffsetX = lastConfig.mapOffsetX;
      this.configuration.centerOffsetY = lastConfig.centerOffsetY;
    }

    if (stopRendering || startRendering) {
      this.renderingData.thresholdData = {
        MinimumElevation: -1,
        MinimumElevationMode: TerrainLevelMode.PeaksMode,
        MaximumElevation: -1,
        MaximumElevationMode: TerrainLevelMode.PeaksMode,
        FirstFrame: true,
        DisplayRange: 0,
        DisplayMode: 0,
        FrameByteCount: 0,
      };
    }
  }

  public aircraftStatusUpdate(status: AircraftStatus, side: DisplaySide, startup: boolean): void {
    if (
      this.aircraftStatus === null ||
      status.navigationDisplayRenderingMode !== this.aircraftStatus.navigationDisplayRenderingMode ||
      this.pixelPattern === null
    ) {
      let patternData: Uint8ClampedArray = null;

      // eslint-disable-next-line no-bitwise
      if (
        (status.navigationDisplayRenderingMode & TerrainRenderingMode.ScanlineMode) ===
        TerrainRenderingMode.ScanlineMode
      ) {
        patternData = createScanlineModePatternMap();
        this.renderingData.frameValidityDuration = RenderingMapFrameValidityTimeScanlineMode;
        if (startup === false) this.logging.info('Scanline-mode rendering activated');
      } else {
        patternData = createArcModePatternMap();
        this.renderingData.frameValidityDuration = RenderingMapFrameValidityTimeArcMode;
        if (startup === false) this.logging.info('ARC-mode rendering activated');
      }

      if (patternData !== null) {
        // no delete() — patternUpload is immutable:false, so this is the kernel's own
        // output texture, reused on every run. See MapHandler.cleanupMemory().
        this.pixelPattern = this.patternUpload(patternData, NavigationDisplayMaxPixelWidth) as Texture;
        // some GPU drivers require the flush call to release internal memory
        if (GpuProcessingActive && this.patternUpload.context) this.patternUpload.context.flush();
      }
    }

    this.aircraftStatus = status;
    if (side === DisplaySide.Left) {
      this.configureNavigationDisplay(this.aircraftStatus.efisDataCapt);
    } else {
      this.configureNavigationDisplay(this.aircraftStatus.efisDataFO);
    }
  }

  private createElevationHistogram(localElevationMap: Texture | number[][]): Texture | number[] {
    if (localElevationMap === null) return null;

    if (!GpuProcessingActive) {
      const width = this.configuration.mapWidth;
      const height = this.configuration.mapHeight;
      const extractData = (obj: any): any => {
        if (Array.isArray(obj)) return obj;
        if (typeof obj?.toArray === 'function') return obj.toArray();
        if (obj?.data) return obj.data;
        return obj;
      };
      const elevGrid = extractData(localElevationMap) as number[][];
      const histogram = new Array(HistogramBinCount).fill(0);
      for (let y = 0; y < height; y++) {
        const row = elevGrid[y];
        for (let x = 0; x < width; x++) {
          let elevation = row[x];
          if (elevation !== UnknownElevation && elevation !== InvalidElevation && elevation !== WaterElevation) {
            elevation -= HistogramMinimumElevation;
            const bin = Math.max(Math.min(Math.ceil(elevation / HistogramBinRange), HistogramBinCount), 0);
            histogram[bin] += 1;
          }
        }
      }
      return histogram;
    }

    // GPU mode
    const patchesInX = Math.ceil(this.configuration.mapWidth / HistogramPatchSize);
    const patchesInY = Math.ceil(this.configuration.mapHeight / HistogramPatchSize);
    const patchCount = patchesInX * patchesInY;

    if (this.localHistogram.output === null || this.localHistogram.output[1] !== patchCount) {
      this.localHistogram = this.localHistogram.setOutput([HistogramBinCount, patchCount]);
    }

    const localHistograms = this.localHistogram(
      localElevationMap as Texture,
      this.configuration.mapWidth,
      this.configuration.mapHeight,
    ) as Texture;
    const histogram = this.histogram(localHistograms, patchCount) as Texture;

    // some GPU drivers require the flush call to release internal memory
    if (GpuProcessingActive) {
      if (this.localHistogram.context) this.localHistogram.context.flush();
      if (this.histogram.context) this.histogram.context.flush();
    }

    return histogram;
  }

  private calculateAbsoluteCutOffAltitude(): number {
    if (this.aircraftStatus === null || this.aircraftStatus.runwayDataValid === false) {
      return HistogramMinimumElevation;
    }

    const destinationElevation = this.maphandler.extractElevation(
      this.aircraftStatus.runwayLatitude,
      this.aircraftStatus.runwayLongitude,
    );

    if (destinationElevation !== InvalidElevation) {
      let cutOffAltitude = RenderingCutOffAltitudeMaximum;

      const distance = distanceWgs84(
        this.aircraftStatus.latitude,
        this.aircraftStatus.longitude,
        this.aircraftStatus.runwayLatitude,
        this.aircraftStatus.runwayLongitude,
      );
      if (distance <= RenderingMaxAirportDistance) {
        const distanceFeet = distance * FeetPerNauticalMile;

        // calculate the glide until touchdown
        const opposite = this.aircraftStatus.altitude - destinationElevation;
        let glideRadian = 0.0;
        if (opposite > 0 && distance > 0) {
          // calculate the glide slope, opposite [ft] -> distance needs to be converted to feet
          glideRadian = Math.atan(opposite / distanceFeet);
        }

        // check if the glide is greater or equal 3Â°
        if (glideRadian < 0.0523599) {
          if (distance <= 1.0 || glideRadian === 0.0) {
            // use the minimum value close to the airport
            cutOffAltitude = RenderingCutOffAltitudeMinimimum;
          } else {
            // use a linear model from max to min for 4 nm to 1 nm
            const slope =
              (RenderingCutOffAltitudeMinimimum - RenderingCutOffAltitudeMaximum) / ThreeNauticalMilesInFeet;
            cutOffAltitude = Math.round(slope * (distanceFeet - FeetPerNauticalMile) + RenderingCutOffAltitudeMaximum);

            // ensure that we are not below the minimum and not above the maximum
            cutOffAltitude = Math.max(cutOffAltitude, RenderingCutOffAltitudeMinimimum);
            cutOffAltitude = Math.min(cutOffAltitude, RenderingCutOffAltitudeMaximum);
          }
        }
      }

      return cutOffAltitude;
    }

    return HistogramMinimumElevation;
  }

  private analyzeMetadata(metadata: number[], cutOffAltitude: number): NavigationDisplayData {
    const retval = new NavigationDisplayData();

    if (metadata[0] === 0) {
      // normal mode
      const [__, ___, maxElevation, highDensityRed, ____, lowDensityYellow, highDensityGreen, lowDensityGreen] =
        metadata;

      retval.MinimumElevation = cutOffAltitude > lowDensityGreen ? cutOffAltitude : lowDensityGreen;
      if (lowDensityYellow <= highDensityGreen) {
        retval.MinimumElevationMode = TerrainLevelMode.Warning;
      } else {
        retval.MinimumElevationMode = TerrainLevelMode.PeaksMode;
      }

      retval.MaximumElevation = maxElevation;
      if (maxElevation >= highDensityRed) {
        retval.MaximumElevationMode = TerrainLevelMode.Caution;
      } else {
        retval.MaximumElevationMode = TerrainLevelMode.Warning;
      }
    } else {
      // peaks mode
      const [__, minElevation, maxElevation, ___, ____, lowDensityGreen] = metadata;

      if (maxElevation < 0) {
        retval.MinimumElevation = -1;
        retval.MaximumElevation = 0;
      } else {
        retval.MinimumElevation = lowDensityGreen > minElevation ? lowDensityGreen : minElevation;
        retval.MaximumElevation = maxElevation;
      }
      retval.MinimumElevationMode = TerrainLevelMode.PeaksMode;
      retval.MaximumElevationMode = TerrainLevelMode.PeaksMode;
    }

    return retval;
  }

  /*
   * Concept for the metadata row:
   * - The idea comes initially from image capturing systems and image decoding information, etc are stored in dedicated rows of one image
   * - The ND rendering reuses this idea to store the relevant information in two pixels
   *   Take a deeper look in the GPU code to get the channel and pixel encoding
   * - The statistics calculation is done on the GPU to reduce the number of transmitted data from the GPU to the CPU
   *   The reduction increases the system performance and an additional row is less time consuming than transmitting the histogram
   * - The red channel of the first pixel in the last row defines the rendering mode (0 === normal mode, 1 === peaks mode)
   */
  private createNavigationDisplayMap(
    elevationMap: Texture | number[][],
    histogram: Texture | number[],
    cutOffAltitude: number,
  ): KernelOutput {
    if (elevationMap === null || histogram === null) return null;

    // GPU.js CPU mode has ~1.5M thread invocations overhead (~3s), vanilla JS does same work in ~200ms
    if (!GpuProcessingActive) {
      return this.createNavigationDisplayMapCPU(elevationMap, histogram, cutOffAltitude);
    }

    if (
      this.renderer.output === null ||
      this.renderer.output[0] !== this.configuration.mapWidth * RenderingColorChannelCount ||
      this.renderer.output[1] !== this.configuration.mapHeight + 1
    ) {
      this.renderer = this.renderer.setOutput([
        this.configuration.mapWidth * RenderingColorChannelCount,
        this.configuration.mapHeight + 1,
      ]);
    }

    const terrainmap = this.renderer(
      elevationMap,
      histogram,
      this.pixelPattern,
      this.configuration.mapWidth,
      this.configuration.mapHeight,
      this.aircraftStatus.altitude,
      this.aircraftStatus.verticalSpeed,
      this.aircraftStatus.gearIsDown ? RenderingGearDownOffset : RenderingNonGearDownOffset,
      cutOffAltitude,
    ) as KernelOutput;

    // some GPU drivers require the flush call to release internal memory
    if (GpuProcessingActive && this.renderer.context) this.renderer.context.flush();

    return terrainmap;
  }

  private getAngleMap(): Float32Array {
    const { mapWidth: width, mapHeight: height } = this.configuration;

    if (this.angleMapCache !== null && this.angleMapCache.width === width && this.angleMapCache.height === height) {
      return this.angleMapCache.angles;
    }

    // Compute the angle for every pixel once. The result depends only on the map dimensions, so it can be reused until the dimensions change.
    const angles = new Float32Array(width * height);
    let arrayIndex = 0;
    for (let y = 0; y < height; ++y) {
      for (let x = 0; x < width; ++x) {
        const distance = Math.sqrt((x - width / 2) ** 2 + (height - y) ** 2);
        angles[arrayIndex] = distance === 0 ? 0 : Math.acos((height - y) / distance) * (180.0 / Math.PI);
        arrayIndex++;
      }
    }

    this.angleMapCache = { width, height, angles };
    return angles;
  }

  private createNavigationDisplayMapCPU(
    elevationMap: Texture | number[][],
    histogram: Texture | number[],
    cutOffAltitude: number,
  ): number[][] {
    const width = this.configuration.mapWidth;
    const height = this.configuration.mapHeight;
    const altitude = this.aircraftStatus.altitude;
    const verticalSpeed = this.aircraftStatus.verticalSpeed;
    const gearDownAltitudeOffset = this.aircraftStatus.gearIsDown
      ? RenderingGearDownOffset
      : RenderingNonGearDownOffset;

    const extractData = (obj: any): any => {
      if (Array.isArray(obj)) return obj;
      if (typeof obj?.toArray === 'function') return obj.toArray();
      if (obj?.data) return obj.data;
      return obj;
    };

    const elevGrid = extractData(elevationMap) as number[][];
    const histArr = extractData(histogram) as number[];
    const patternArr = extractData(this.pixelPattern) as number[][];

    const outputWidth = width * RenderingColorChannelCount;
    const outputHeight = height + 1;

    const cutOffAltitudeBin = Math.floor((cutOffAltitude - HistogramMinimumElevation) / HistogramBinRange);
    const referenceAltitude = altitude + (verticalSpeed <= -1000 ? verticalSpeed * 0.5 : 0);

    let totalFrequency = 0;
    for (let b = cutOffAltitudeBin; b < HistogramBinCount; b++) totalFrequency += histArr[b];

    let minElevationBin = -1;
    let maxElevationBin = -1;
    let lowerBin = -1;
    let upperBin = -1;
    let currentPercentile = 0;
    for (let b = cutOffAltitudeBin; b < HistogramBinCount; b++) {
      if (totalFrequency > 0) {
        currentPercentile += histArr[b] / totalFrequency;
        if (lowerBin === -1 && currentPercentile >= RenderingLowerPercentile) lowerBin = b;
        if (upperBin === -1 && currentPercentile >= RenderingUpperPercentile) upperBin = b;
      }
      if (histArr[b] > 0) {
        if (minElevationBin < 0) minElevationBin = b;
        maxElevationBin = b;
      }
    }
    if (lowerBin > HistogramBinCount) lowerBin = HistogramBinCount - 1;
    if (upperBin < 0) upperBin = HistogramBinCount - 1;

    const lowerPercentileElevation = lowerBin * HistogramBinRange + HistogramMinimumElevation;
    const upperPercentileElevation = upperBin * HistogramBinRange + HistogramMinimumElevation;
    const minElevation = minElevationBin >= 0 ? minElevationBin * HistogramBinRange + HistogramMinimumElevation : -1;
    const maxElevation =
      maxElevationBin >= 0 ? (maxElevationBin + 1) * HistogramBinRange + HistogramMinimumElevation : 0;
    const flatEarth = RenderingFlatEarthThreshold - (maxElevation - minElevation);
    const halfElevation = maxElevation * 0.5;

    // precompute thresholds
    const useNormalMode = maxElevation >= referenceAltitude - gearDownAltitudeOffset;

    let warningThresholds: [number, number, number];
    let greenThresholds: [number, number];
    let peaksThresholds: [number, number, number];

    if (useNormalMode) {
      warningThresholds = calculateNormalModeWarningThresholdsCPU(
        referenceAltitude,
        minElevation,
        gearDownAltitudeOffset,
      );
      greenThresholds = calculateNormalModeGreenThresholdsCPU(
        referenceAltitude,
        minElevation,
        flatEarth,
        lowerPercentileElevation,
        halfElevation,
      );
    } else {
      peaksThresholds = calculatePeaksModeThresholdsCPU(
        lowerPercentileElevation,
        upperPercentileElevation,
        halfElevation,
        minElevation,
        maxElevation,
      );
    }

    const output: number[][] = new Array(outputHeight);
    for (let y = 0; y < outputHeight; y++) {
      output[y] = new Array(outputWidth);
      for (let x = 0; x < outputWidth; x++) {
        const pixelX = Math.floor(x / RenderingColorChannelCount);
        const colorChannel = x % RenderingColorChannelCount;

        if (y >= height) {
          // metadata row
          if (useNormalMode) {
            output[y][x] =
              x < 4
                ? [0, minElevation, maxElevation, warningThresholds[2]][colorChannel]
                : [warningThresholds[1], warningThresholds[0], greenThresholds[1], greenThresholds[0]][colorChannel];
          } else {
            output[y][x] =
              x < 4
                ? [1, minElevation, maxElevation, peaksThresholds[2]][colorChannel]
                : [peaksThresholds[1], peaksThresholds[0], 0, 0][colorChannel];
          }
          continue;
        }

        // 8x8 patch scan for max elevation
        let pixelElevation = -1000;
        const patchXStart = pixelX - (pixelX % 8);
        const patchXEnd = Math.min(width, patchXStart + 8);
        const patchYStart = y - (y % 8);
        const patchYEnd = Math.min(height, patchYStart + 8);
        for (let py = patchYStart; py < patchYEnd; py++) {
          const row = elevGrid[py];
          for (let px = patchXStart; px < patchXEnd; px++) {
            const elev = row[px];
            if (elev > pixelElevation && elev !== InvalidElevation) pixelElevation = elev;
          }
        }

        const patternValue = patternArr[y][pixelX];
        if (patternValue === 0) {
          output[y][x] = colorChannel === 0 ? 4 : colorChannel === 1 ? 4 : colorChannel === 2 ? 5 : 0;
          continue;
        }

        let r: number, g: number, b: number, a: number;
        if (useNormalMode) {
          [r, g, b, a] = renderNormalModeCPU(
            pixelElevation,
            patternValue,
            height,
            referenceAltitude,
            minElevation,
            maxElevation,
            flatEarth,
            gearDownAltitudeOffset,
            lowerPercentileElevation,
            halfElevation,
            cutOffAltitude,
          );
        } else {
          [r, g, b, a] = renderPeaksModeCPU(
            pixelElevation,
            patternValue,
            height,
            lowerPercentileElevation,
            upperPercentileElevation,
            halfElevation,
            minElevation,
            maxElevation,
          );
        }
        output[y][x] = colorChannel === 0 ? r : colorChannel === 1 ? g : colorChannel === 2 ? b : a;
      }
    }
    return output;
  }

  private arcModeTransitionFrame(
    oldFrame: Uint8ClampedArray,
    newFrame: Uint8ClampedArray,
    startAngle: number,
    endAngle: number,
  ): Uint8ClampedArray {
    if (newFrame === null) return null;

    const result = this.acquireTransitionBuffer(
      this.configuration.mapWidth * RenderingColorChannelCount * this.configuration.mapHeight,
    );

    // access data as uint32-array for performance reasons
    const destination = new Uint32Array(result.buffer);
    // UInt32-version of RGBA (4, 4, 5, 0)
    destination.fill(328708);
    const oldSource = oldFrame !== null ? new Uint32Array(oldFrame.buffer) : null;
    const newSource = new Uint32Array(newFrame.buffer);
    const angleMap = this.getAngleMap();

    for (let arrayIndex = 0; arrayIndex < angleMap.length; ++arrayIndex) {
      const angle = angleMap[arrayIndex];

      if (startAngle <= angle && angle <= endAngle) {
        destination[arrayIndex] = newSource[arrayIndex];
      } else if (oldSource !== null) {
        destination[arrayIndex] = oldSource[arrayIndex];
      }
    }

    return result;
  }

  private arcModeTransition(): boolean {
    // nothing to do here
    if (this.renderingData.finalFrame === null) return true;

    this.renderingData.thresholdData.DisplayRange = this.configuration.ndRange;
    this.renderingData.thresholdData.DisplayMode = this.configuration.efisMode;

    this.renderingData.currentTransitionBorder += RenderingMapTransitionAngularStep;

    if (this.renderingData.currentTransitionBorder < 90) {
      this.renderingData.currentFrame = this.arcModeTransitionFrame(
        this.renderingData.lastFrame,
        this.renderingData.finalFrame,
        this.renderingData.startTransitionBorder,
        this.renderingData.currentTransitionBorder,
      );

      return false;
    }

    // perform the last frame
    if (this.renderingData.currentTransitionBorder - RenderingMapTransitionAngularStep < 90) {
      this.renderingData.currentFrame = this.arcModeTransitionFrame(
        this.renderingData.lastFrame,
        this.renderingData.finalFrame,
        this.renderingData.startTransitionBorder,
        90,
      );
    }

    // do not overwrite the last frame of the initialization
    this.renderingData.lastFrame = this.renderingData.currentFrame;

    return true;
  }

  private scanlineModeTransitionFrame(oldFrame: Uint8ClampedArray, newFrame: Uint8ClampedArray): Uint8ClampedArray {
    if (newFrame === null) return null;

    const result = this.acquireTransitionBuffer(
      this.configuration.mapWidth * RenderingColorChannelCount * this.configuration.mapHeight,
    );

    // access data as uint32-array due to performance reasons
    const destination = new Uint32Array(result.buffer);
    // UInt32-version of RGBA (4, 4, 5, 0)
    destination.fill(328708);
    const oldSource = oldFrame !== null ? new Uint32Array(oldFrame.buffer) : null;
    const newSource = new Uint32Array(newFrame.buffer);

    let arrayIndex = 0;
    for (let y = 0; y < this.configuration.mapHeight; ++y) {
      for (let x = 0; x < this.configuration.mapWidth; ++x) {
        if (y <= this.renderingData.startTransitionBorder && y >= this.renderingData.currentTransitionBorder) {
          destination[arrayIndex] = newSource[arrayIndex];
        } else if (oldSource !== null) {
          destination[arrayIndex] = oldSource[arrayIndex];
        }

        arrayIndex++;
      }
    }

    return result;
  }

  private scanlineModeTransition(): boolean {
    // nothing to do here
    if (this.renderingData.finalFrame === null) return true;

    const verticalStep = Math.round(
      (this.configuration.mapHeight / RenderingMapTransitionDurationScanlineMode) * RenderingMapTransitionDeltaTime,
    );

    this.renderingData.thresholdData.DisplayRange = this.configuration.ndRange;
    this.renderingData.thresholdData.DisplayMode = this.configuration.efisMode;
    this.renderingData.currentTransitionBorder -= verticalStep;

    if (this.renderingData.currentTransitionBorder > 0) {
      this.renderingData.currentFrame = this.scanlineModeTransitionFrame(
        this.renderingData.lastFrame,
        this.renderingData.finalFrame,
      );

      return false;
    }

    // perform the last frame
    if (this.renderingData.currentTransitionBorder + verticalStep >= 0) {
      this.renderingData.currentFrame = this.scanlineModeTransitionFrame(
        this.renderingData.lastFrame,
        this.renderingData.finalFrame,
      );
    }

    // do not overwrite the last frame of the initialization
    this.renderingData.lastFrame = this.renderingData.currentFrame;

    return true;
  }

  // immediate=true for a pilot-initiated change (range/mode/TERR toggle): skip sweep
  // phase alignment so the new picture starts drawing straight away
  public reset(immediate = false): void {
    this.renderingData = {
      startTransitionBorder: 0,
      currentTransitionBorder: 0,
      frameCounter: 0,
      thresholdData: {
        MinimumElevation: -1,
        MinimumElevationMode: TerrainLevelMode.PeaksMode,
        MaximumElevation: -1,
        MaximumElevationMode: TerrainLevelMode.PeaksMode,
        FirstFrame: true,
        DisplayRange: 0,
        DisplayMode: 0,
        FrameByteCount: 0,
      },
      finalFrame: null,
      lastFrame: null,
      currentFrame: null,
      frameValidityDuration: 1000,
      forceFullSweep: immediate,
    };
  }

  public startNewMapCycle(currentTime: number): void {
    this.configuration.mapWidth = this.configuration.arcMode ? RenderingArcModePixelWidth : RenderingRoseModePixelWidth;
    if (
      (this.aircraftStatus.navigationDisplayRenderingMode & TerrainRenderingMode.VerticalDisplayRequired) ===
      TerrainRenderingMode.VerticalDisplayRequired
    ) {
      // Only A380X requires vertical display
      this.configuration.mapHeight = this.configuration.arcMode
        ? NavigationDisplayArcModePixelHeightA380X
        : NavigationDisplayRoseModePixelHeightA380X;
      this.configuration.centerOffsetY = this.configuration.arcMode
        ? NavigationDisplayArcModeCenterOffsetYA380X
        : NavigationDisplayRoseModeCenterOffsetYA380X;
    } else {
      this.configuration.mapHeight = this.configuration.arcMode
        ? NavigationDisplayArcModePixelHeightA32NX
        : NavigationDisplayRoseModePixelHeightA32NX;
      this.configuration.centerOffsetY = NavigationDisplayCenterOffsetYA32NX;
    }
    this.configuration.mapOffsetX = Math.ceil((NavigationDisplayMaxPixelWidth - this.configuration.mapWidth) * 0.5);

    if (this.configuration.ndRange === 0) {
      this.reset();
      return;
    }

    const t0 = Date.now();
    const elevationMap = this.maphandler.createLocalElevationMap(this.configuration);
    const t1 = Date.now();
    const histogram = this.createElevationHistogram(elevationMap);
    const t2 = Date.now();
    const cutOffAltitude = this.calculateAbsoluteCutOffAltitude();
    const t3 = Date.now();

    // create the final map
    const renderingData = this.createNavigationDisplayMap(elevationMap, histogram, cutOffAltitude);
    const t4 = Date.now();
    if (renderingData === null) return;

    this.logging.debug(
      `startNewMapCycle kernels: elevMap=${t1 - t0}ms hist=${t2 - t1}ms cutoff=${t3 - t2}ms render=${t4 - t3}ms total=${t4 - t0}ms`,
    );

    const frame = renderingData as number[][];
    const metadata = frame.splice(frame.length - 1)[0];

    // copy row-by-row into a reused buffer instead of fastFlatten(): that built a boxed
    // JS Array of ~1.5M numbers (~12MB) per cycle purely to feed the Uint8ClampedArray
    // constructor. set() clamps identically.
    const frameWidth = frame[0].length;
    const frameLength = frame.length * frameWidth;
    if (this.renderingData.finalFrame === null || this.renderingData.finalFrame.length !== frameLength) {
      this.renderingData.finalFrame = new Uint8ClampedArray(frameLength);
    }
    for (let y = 0; y < frame.length; ++y) {
      this.renderingData.finalFrame.set(frame[y], y * frameWidth);
    }

    this.renderingData.thresholdData = this.analyzeMetadata(metadata, cutOffAltitude);

    // Elevations and thresholds are in feet. If these read as metres (~3x low), as raw
    // sentinels (32766/32767) or as 0..255, the fault is upstream of the colour logic —
    // in the tile conversion or the world map texture precision, not in the thresholds.
    // info, not debug: this is the line that identifies a wrong-colour report, and debug
    // is filtered out of the shipped log. Throttled so it stays readable.
    if (TerrainDiagnosticsEnabled && Date.now() - this.lastThresholdReport > 10_000) {
      this.lastThresholdReport = Date.now();
      const normalMode = metadata[0] === 0;
      this.logging.info(
        `ND thresholds: mode=${normalMode ? 'normal' : 'PEAKS(all green)'} ` +
          `min=${Math.round(this.renderingData.thresholdData.MinimumElevation)}ft ` +
          `max=${Math.round(this.renderingData.thresholdData.MaximumElevation)}ft ` +
          `cutOff=${Math.round(cutOffAltitude)}ft alt=${Math.round(this.aircraftStatus.altitude)}ft ` +
          `gear=${this.aircraftStatus.gearIsDown ? 'down' : 'up'} ` +
          `raw=[${Array.from(metadata.slice(0, 8))
            .map((v: number) => Math.round(v))
            .join(',')}]`,
      );
    }

    if (!this.configuration.terrOnNd) {
      // metadata is used in the TERRONND WASM module to detect frame changes, so we still have to send it even though ND TERR would be disabled on the A380X
      // Send negative values for the thresholds in order to hide them instead
      this.renderingData.thresholdData.MinimumElevation = -1;
      this.renderingData.thresholdData.MaximumElevation = -1;
    }

    this.renderingData.thresholdData.DisplayRange = this.configuration.ndRange;
    this.renderingData.thresholdData.DisplayMode = this.configuration.efisMode;

    // Phase alignment exists so the sweep looks like it has been running all along at
    // startup. On a pilot-initiated change (range, mode, TERR toggle) it is wrong: the
    // sweep resumes mid-arc, so only the remaining wedge gets the new picture and the
    // rest of the display stays blank until the *next* cycle — up to ~2.8s of visible
    // lag on e.g. 20nm -> 10nm. A deliberate reconfiguration sweeps from the start.
    if (this.renderingData.lastFrame === null && !this.renderingData.forceFullSweep) {
      const timeSinceStart = currentTime - this.startupTime;
      const frameUpdateCount = timeSinceStart / this.renderingData.frameValidityDuration;
      const ratioSinceLastFrame = frameUpdateCount - Math.floor(frameUpdateCount);

      // eslint-disable-next-line no-bitwise
      if (
        (this.aircraftStatus.navigationDisplayRenderingMode & TerrainRenderingMode.ScanlineMode) ===
        TerrainRenderingMode.ScanlineMode
      ) {
        this.renderingData.startTransitionBorder =
          this.configuration.mapHeight - Math.floor(this.configuration.mapHeight * ratioSinceLastFrame);
      } else {
        this.renderingData.startTransitionBorder = Math.floor(90 * ratioSinceLastFrame);
      }
      // eslint-disable-next-line no-bitwise
    } else if (
      (this.aircraftStatus.navigationDisplayRenderingMode & TerrainRenderingMode.ScanlineMode) ===
      TerrainRenderingMode.ScanlineMode
    ) {
      this.renderingData.startTransitionBorder = this.configuration.mapHeight;
    } else {
      this.renderingData.startTransitionBorder = 0;
    }

    this.renderingData.currentTransitionBorder = this.renderingData.startTransitionBorder;
    this.renderingData.forceFullSweep = false;
  }

  public render(): boolean {
    let renderingDone = false;

    // eslint-disable-next-line no-bitwise
    if (
      (this.aircraftStatus.navigationDisplayRenderingMode & TerrainRenderingMode.ScanlineMode) ===
      TerrainRenderingMode.ScanlineMode
    ) {
      renderingDone = this.scanlineModeTransition();
    } else {
      renderingDone = this.arcModeTransition();
    }

    return renderingDone;
  }

  public displayConfiguration(): EfisData {
    return this.configuration;
  }

  public displayData(): NavigationDisplayData {
    return this.renderingData.thresholdData;
  }

  public currentFrame(): Uint8ClampedArray {
    return this.renderingData.currentFrame;
  }
}

// these run when GpuProcessingActive=false, avoiding ~1.5M GPU.js thread invocations

function drawDensityPixelCPU(
  patternValue: number,
  patternIndex: number,
  color: [number, number, number, number],
): [number, number, number, number] {
  if (Math.round(patternValue % patternIndex) === 0) return color;
  return [4, 4, 5, 0];
}

function calculateNormalModeGreenThresholdsCPU(
  referenceAltitude: number,
  minimumElevation: number,
  flatEarth: number,
  lowerPercentile: number,
  halfElevation: number,
): [number, number] {
  let lowDensityGreen =
    referenceAltitude - RenderingNormalModeLowDensityGreenOffset <= minimumElevation
      ? minimumElevation + 200
      : referenceAltitude - RenderingNormalModeLowDensityGreenOffset;
  const highDensityGreen =
    referenceAltitude - RenderingNormalModeHighDensityGreenOffset <= minimumElevation
      ? minimumElevation + 200
      : referenceAltitude - RenderingNormalModeHighDensityGreenOffset;
  if (flatEarth >= 0) {
    if (halfElevation <= lowerPercentile && lowDensityGreen > halfElevation) lowDensityGreen = halfElevation;
    else if (halfElevation > lowerPercentile && lowDensityGreen > lowerPercentile) lowDensityGreen = lowerPercentile;
  }
  return [lowDensityGreen, highDensityGreen];
}

function calculateNormalModeWarningThresholdsCPU(
  referenceAltitude: number,
  minimumElevation: number,
  gearDownAltitudeOffset: number,
): [number, number, number] {
  let lowDensityYellow = referenceAltitude - gearDownAltitudeOffset;
  if (lowDensityYellow <= minimumElevation) lowDensityYellow = minimumElevation + 200;
  return [
    lowDensityYellow,
    referenceAltitude + RenderingNormalModeHighDensityYellowOffset,
    referenceAltitude + RenderingNormalModeHighDensityRedOffset,
  ];
}

function calculatePeaksModeThresholdsCPU(
  lowerPercentile: number,
  upperPercentile: number,
  halfElevation: number,
  minimumElevation: number,
  maximumElevation: number,
): [number, number, number] {
  const lowerDensity = Math.min(lowerPercentile, halfElevation);
  let higherDensity = Math.min(upperPercentile, (maximumElevation - minimumElevation) * 0.65 + minimumElevation);
  let solidDensity = (maximumElevation - minimumElevation) * 0.95 + minimumElevation;
  if (
    lowerDensity >= higherDensity ||
    lowerDensity >= solidDensity ||
    higherDensity >= solidDensity ||
    lowerPercentile >= upperPercentile ||
    lowerPercentile >= solidDensity ||
    upperPercentile >= solidDensity
  ) {
    higherDensity = maximumElevation + 100;
    solidDensity = maximumElevation + 100;
  }
  return [lowerDensity, higherDensity, solidDensity];
}

function renderNormalModeCPU(
  elevation: number,
  patternValue: number,
  height: number,
  referenceAltitude: number,
  minimumElevation: number,
  maximumElevation: number,
  flatEarth: number,
  gearDownAltitudeOffset: number,
  lowerPercentile: number,
  halfElevation: number,
  absoluteCutOffAltitude: number,
): [number, number, number, number] {
  const wt = calculateNormalModeWarningThresholdsCPU(referenceAltitude, minimumElevation, gearDownAltitudeOffset);
  const gt = calculateNormalModeGreenThresholdsCPU(
    referenceAltitude,
    minimumElevation,
    flatEarth,
    lowerPercentile,
    halfElevation,
  );

  if (
    elevation !== InvalidElevation &&
    elevation !== UnknownElevation &&
    elevation !== WaterElevation &&
    elevation >= absoluteCutOffAltitude
  ) {
    if (elevation >= wt[2]) return drawDensityPixelCPU(patternValue, 5, [255, 0, 0, 255]);
    if (elevation >= wt[1]) return drawDensityPixelCPU(patternValue, 5, [255, 255, 50, 255]);
    if (elevation >= gt[1] && elevation < wt[0]) return drawDensityPixelCPU(patternValue, 5, [0, 255, 0, 255]);
    if (elevation >= wt[0] && elevation < wt[1]) return drawDensityPixelCPU(patternValue, 3, [255, 255, 50, 255]);
    if (elevation >= gt[0] && elevation < gt[1]) return drawDensityPixelCPU(patternValue, 3, [0, 255, 0, 255]);
  } else if (elevation === WaterElevation) {
    return drawDensityPixelCPU(patternValue, 7, [0, 255, 255, 255]);
  }
  return [0, 0, 0, 255];
}

function renderPeaksModeCPU(
  elevation: number,
  patternValue: number,
  height: number,
  lowerPercentile: number,
  upperPercentile: number,
  halfElevation: number,
  minimumElevation: number,
  maximumElevation: number,
): [number, number, number, number] {
  const pt = calculatePeaksModeThresholdsCPU(
    lowerPercentile,
    upperPercentile,
    halfElevation,
    minimumElevation,
    maximumElevation,
  );

  if (elevation !== InvalidElevation && elevation !== UnknownElevation && elevation !== WaterElevation) {
    if (pt[2] <= elevation) return [0, 255, 0, 255];
    if (pt[1] <= elevation) return drawDensityPixelCPU(patternValue, 5, [0, 255, 0, 255]);
    if (pt[0] <= elevation) return drawDensityPixelCPU(patternValue, 3, [0, 255, 0, 255]);
  } else if (elevation === WaterElevation) {
    return drawDensityPixelCPU(patternValue, 7, [0, 255, 255, 255]);
  }
  return [0, 0, 0, 255];
}
