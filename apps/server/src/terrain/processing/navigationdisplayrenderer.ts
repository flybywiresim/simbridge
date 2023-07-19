import { GPU, IKernelRunShortcut, KernelOutput, Texture } from 'gpu.js';
import {
    FeetPerNauticalMile,
    GpuProcessingActive,
    InvalidElevation,
    NavigationDisplayArcModePixelHeight,
    NavigationDisplayMaxPixelHeight,
    NavigationDisplayMaxPixelWidth,
    NavigationDisplayRoseModePixelHeight,
    RenderingColorChannelCount,
    RenderingMapTransitionDeltaTime,
    RenderingMapTransitionDuration,
    RenderingMapUpdateTimeout,
    ThreeNauticalMilesInFeet,
    UnknownElevation,
    WaterElevation,
} from './generic/constants';
import { distanceWgs84, fastFlatten } from './generic/helper';
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
import { createArcModePatternMap } from './gpu/patterns/arcmode';
import { createElevationHistogram, createLocalElevationHistogram } from './gpu/statistics';
import { uploadTextureData } from './gpu/upload';
import { Logger } from './logging/logger';
import { MapHandler } from './maphandler';
import { AircraftStatus, DisplaySide, NavigationDisplay, NavigationDisplayData, TerrainLevelMode, TerrainRenderingMode } from '../types';

// histogram parameters
const HistogramBinRange = 100;
const HistogramMinimumElevation = -500; // some areas in the world are below water level
const HistogramMaximumElevation = 29040; // mount everest
const HistogramBinCount = Math.ceil((HistogramMaximumElevation - HistogramMinimumElevation + 1) / HistogramBinRange);
const HistogramPatchSize = 128;

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
const RenderingMapFrameValidityTime = RenderingMapTransitionDuration + RenderingMapUpdateTimeout;
const RenderingMapTransitionAngularStep = Math.round((90 / RenderingMapTransitionDuration) * RenderingMapTransitionDeltaTime);

export class NavigationDisplayRenderer {
    private configuration: NavigationDisplay = null;

    private patternUpload: IKernelRunShortcut = null;

    private pixelPattern: Texture = null;

    private localHistogram: IKernelRunShortcut = null;

    private histogram: IKernelRunShortcut = null;

    private renderer: IKernelRunShortcut = null;

    private aircraftStatus: AircraftStatus = null;

    private resetData: boolean = true;

    private renderingData: {
        startAngle: number,
        currentAngle: number,
        frameCounter: number,
        thresholdData: NavigationDisplayData,
        finalFrame: Uint8ClampedArray,
        lastFrame: Uint8ClampedArray,
        currentFrame: Uint8ClampedArray,
    } = {
        startAngle: 0,
        currentAngle: 0,
        frameCounter: 0,
        thresholdData: null,
        finalFrame: null,
        lastFrame: null,
        currentFrame: null,
    };

    constructor(private readonly maphandler: MapHandler, private logging: Logger, private readonly gpu: GPU, private readonly startupTime: number) {
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
        if (this.pixelPattern !== null) {
            this.pixelPattern.delete();
        }
        this.patternUpload.destroy();
        this.localHistogram.destroy();
        this.histogram.destroy();
        this.renderer.destroy();
    }

    public async initialize(elevationMap: Texture): Promise<boolean> {
        this.startNewMapCycle(elevationMap);
        return true;
    }

    private configureNavigationDisplay(config: NavigationDisplay): void {
        const lastConfig = this.configuration;
        const stopRendering = !config.active && lastConfig !== null && lastConfig.active;
        let startRendering = config.active && (lastConfig === null || !lastConfig.active);
        startRendering ||= lastConfig !== null && ((lastConfig.range !== config.range) || (lastConfig.arcMode !== config.arcMode));
        startRendering ||= lastConfig !== null && (lastConfig.efisMode !== config.efisMode);

        this.configuration = config;

        if (stopRendering || startRendering) {
            this.resetData = true;

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
        if (this.aircraftStatus === null || status.navigationDisplayRenderingMode !== this.aircraftStatus.navigationDisplayRenderingMode || this.pixelPattern === null) {
            switch (status.navigationDisplayRenderingMode) {
            case TerrainRenderingMode.ArcMode:
                const patternData = createArcModePatternMap();
                this.pixelPattern = this.patternUpload(patternData, NavigationDisplayMaxPixelWidth) as Texture;
                // some GPU drivers require the flush call to release internal memory
                if (GpuProcessingActive) this.patternUpload.context.flush();

                if (startup === false) this.logging.info('ARC-mode rendering activated');
                break;
            default:
                if (startup === false) this.logging.error('No known rendering mode selected');
                break;
            }
        }

        this.aircraftStatus = status;
        if (side === DisplaySide.Left) {
            this.configureNavigationDisplay(this.aircraftStatus.navigationDisplayCapt);
        } else {
            this.configureNavigationDisplay(this.aircraftStatus.navigationDisplayFO);
        }
    }

    private createElevationHistogram(localElevationMap: Texture): Texture {
        if (localElevationMap === null) return null;

        // create the histogram statistics
        const patchesInX = Math.ceil(this.configuration.mapWidth / HistogramPatchSize);
        const patchesInY = Math.ceil(this.configuration.mapHeight / HistogramPatchSize);
        const patchCount = patchesInX * patchesInY;

        if (this.localHistogram.output === null
            || this.localHistogram.output[1] !== patchCount
        ) {
            this.localHistogram = this.localHistogram
                .setOutput([HistogramBinCount, patchCount]);
        }

        const localHistograms = this.localHistogram(
            localElevationMap,
            this.configuration.mapWidth,
            this.configuration.mapHeight,
        ) as Texture;
        const histogram = this.histogram(
            localHistograms,
            patchCount,
        ) as Texture;

        // some GPU drivers require the flush call to release internal memory
        if (GpuProcessingActive) {
            this.localHistogram.context.flush();
            this.histogram.context.flush();
        }

        return histogram;
    }

    private calculateAbsoluteCutOffAltitude(): number {
        if (this.aircraftStatus === null || this.aircraftStatus.destinationDataValid === false) {
            return HistogramMinimumElevation;
        }

        const destinationElevation = this.maphandler.extractElevation(this.aircraftStatus.destinationLatitude, this.aircraftStatus.destinationLongitude);

        if (destinationElevation !== InvalidElevation) {
            let cutOffAltitude = RenderingCutOffAltitudeMaximum;

            const distance = distanceWgs84(
                this.aircraftStatus.latitude,
                this.aircraftStatus.longitude,
                this.aircraftStatus.destinationLatitude,
                this.aircraftStatus.destinationLongitude,
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

                // check if the glide is greater or equal 3°
                if (glideRadian < 0.0523599) {
                    if (distance <= 1.0 || glideRadian === 0.0) {
                        // use the minimum value close to the airport
                        cutOffAltitude = RenderingCutOffAltitudeMinimimum;
                    } else {
                        // use a linear model from max to min for 4 nm to 1 nm
                        const slope = (RenderingCutOffAltitudeMinimimum - RenderingCutOffAltitudeMaximum) / ThreeNauticalMilesInFeet;
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
            const [
                _,
                __,
                maxElevation,
                highDensityRed,
                ___,
                lowDensityYellow,
                highDensityGreen,
                lowDensityGreen,
            ] = metadata;

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
            const [
                _,
                minElevation,
                maxElevation,
                __,
                ___,
                lowDensityGreen,
            ] = metadata;

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
     * - The idea comes initialy from image capturing systems and image decoding information, etc are stored in dedicated rows of one image
     * - The ND rendering reuses this idea to store the relevant information in two pixels
     *   Take a deeper look in the GPU code to get the channel and pixel encoding
     * - The statistics calculation is done on the GPU to reduce the number of transmitted data from the GPU to the CPU
     *   The reduction increases the system performance and an additional row is less time consuming than transmitting the histogram
     * - The red channel of the first pixel in the last row defines the rendering mode (0 === normal mode, 1 === peaks mode)
     */
    private createNavigationDisplayMap(
        elevationMap: Texture,
        histogram: Texture,
        cutOffAltitude: number,
    ): KernelOutput {
        if (elevationMap === null || histogram === null) return null;

        if (this.renderer.output === null
            || this.renderer.output[0] !== this.configuration.mapWidth
            || this.renderer.output[1] !== this.configuration.mapHeight) {
            this.renderer = this.renderer.setOutput([this.configuration.mapWidth * RenderingColorChannelCount, this.configuration.mapWidth + 1]);
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
        if (GpuProcessingActive) this.renderer.context.flush();

        return terrainmap;
    }

    private arcModeTransitionFrame(
        oldFrame: Uint8ClampedArray,
        newFrame: Uint8ClampedArray,
        startAngle: number,
        endAngle: number,
    ): Uint8ClampedArray {
        const result = new Uint8ClampedArray(this.configuration.mapWidth * RenderingColorChannelCount * this.configuration.mapHeight);

        // access data as uint32-array for performance reasons
        const destination = new Uint32Array(result.buffer);
        // UInt32-version of RGBA (4, 4, 5, 255)
        destination.fill(4278518788);
        const oldSource = oldFrame !== null ? new Uint32Array(oldFrame.buffer) : null;
        const newSource = new Uint32Array(newFrame.buffer);

        let arrayIndex = 0;
        for (let y = 0; y < this.configuration.mapHeight; ++y) {
            for (let x = 0; x < this.configuration.mapWidth; ++x) {
                const distance = Math.sqrt((x - this.configuration.mapWidth / 2) ** 2 + (this.configuration.mapHeight - y) ** 2);
                const angle = Math.acos((this.configuration.mapHeight - y) / distance) * (180.0 / Math.PI);

                if (startAngle <= angle && angle <= endAngle) {
                    destination[arrayIndex] = newSource[arrayIndex];
                } else if (oldSource !== null) {
                    destination[arrayIndex] = oldSource[arrayIndex];
                }

                arrayIndex++;
            }
        }

        return result;
    }

    private arcModeTransition(): void {
        this.renderingData.thresholdData.DisplayRange = this.configuration.range;
        this.renderingData.thresholdData.DisplayMode = this.configuration.efisMode;

        this.renderingData.currentAngle += RenderingMapTransitionAngularStep;

        if (this.renderingData.currentAngle < 90) {
            this.renderingData.currentFrame = this.arcModeTransitionFrame(
                this.renderingData.lastFrame,
                this.renderingData.finalFrame,
                this.renderingData.startAngle,
                this.renderingData.currentAngle,
            );
        } else {
            if (this.renderingData.currentAngle - RenderingMapTransitionAngularStep < 90) {
                this.renderingData.currentFrame = this.arcModeTransitionFrame(
                    this.renderingData.lastFrame,
                    this.renderingData.finalFrame,
                    this.renderingData.startAngle,
                    90,
                );
            }

            // do not overwrite the last frame of the initialization
            this.renderingData.lastFrame = this.renderingData.currentFrame;
        }
    }

    public reset(): void {
        this.renderingData = {
            startAngle: 0,
            currentAngle: 0,
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
        };
    }

    public startNewMapCycle(elevationMap: Texture): void {
        if (this.resetData) {
            this.reset();
            this.resetData = false;
        }

        this.configuration.mapWidth = this.configuration.arcMode ? RenderingArcModePixelWidth : RenderingRoseModePixelWidth;
        this.configuration.mapHeight = this.configuration.arcMode ? NavigationDisplayArcModePixelHeight : NavigationDisplayRoseModePixelHeight;
        this.configuration.mapOffsetX = Math.round((NavigationDisplayMaxPixelWidth - this.configuration.mapWidth) * 0.5);

        const histogram = this.createElevationHistogram(elevationMap);
        const cutOffAltitude = this.calculateAbsoluteCutOffAltitude();

        // create the final map
        const renderingData = this.createNavigationDisplayMap(elevationMap, histogram, cutOffAltitude);
        if (renderingData === null) return;

        const frame = renderingData as number[][];
        const metadata = frame.splice(frame.length - 1)[0];

        this.renderingData.finalFrame = new Uint8ClampedArray(fastFlatten(frame));
        this.renderingData.thresholdData = this.analyzeMetadata(metadata, cutOffAltitude);

        this.renderingData.thresholdData.DisplayRange = this.configuration.range;
        this.renderingData.thresholdData.DisplayMode = this.configuration.efisMode;

        if (this.renderingData.lastFrame === null) {
            const timeSinceStart = new Date().getTime() - this.startupTime;
            const frameUpdateCount = timeSinceStart / RenderingMapFrameValidityTime;
            const ratioSinceLastFrame = frameUpdateCount - Math.floor(frameUpdateCount);

            this.renderingData.startAngle = Math.floor(90 * ratioSinceLastFrame);
        } else {
            this.renderingData.startAngle = 0;
        }

        this.renderingData.currentAngle = this.renderingData.startAngle;
    }

    public render(): boolean {
        if (this.resetData) {
            this.reset();
            this.resetData = false;
        }

        switch (this.aircraftStatus.navigationDisplayRenderingMode) {
        case TerrainRenderingMode.ArcMode:
            this.arcModeTransition();
            break;
        default:
            this.logging.error(`Unknown rendering mode defined: ${this.aircraftStatus.navigationDisplayRenderingMode}`);
            break;
        }

        return this.renderingData.currentAngle >= 90;
    }

    public displayConfiguration(): NavigationDisplay {
        return this.configuration;
    }

    public displayData(): NavigationDisplayData {
        return this.renderingData.thresholdData;
    }

    public currentFrame(): Uint8ClampedArray {
        return this.renderingData.currentFrame;
    }
}
