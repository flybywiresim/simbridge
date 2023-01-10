import { parentPort } from 'worker_threads';
import { GPU, IKernelRunShortcut, KernelOutput, Texture } from 'gpu.js';
import { AircraftStatus, NavigationDisplay, PositionData, TerrainRenderingMode } from '../communication/types';
import { TerrainMap } from '../fileformat/terrainmap';
import { Worldmap } from '../mapdata/worldmap';
import { deg2rad, distanceWgs84, rad2deg } from './generic/helper';
import { createLocalElevationMap } from './gpu/elevationmap';
import { normalizeHeading, projectWgs84 } from './gpu/helper';
import {
    calculateNormalModeGreenThresholds,
    calculateNormalModeWarningThresholds,
    calculatePeaksModeThresholds,
    renderNavigationDisplay,
    renderNormalMode,
    renderPeaksMode,
    drawDensityPixel,
} from './gpu/rendering';
import {
    HistogramConstants,
    LocalElevationMapConstants,
    NavigationDisplayConstants,
} from './gpu/interfaces';
import { createElevationHistogram, createLocalElevationHistogram } from './gpu/statistics';
import { uploadTextureData } from './gpu/upload';
import { NavigationDisplayData, TerrainLevelMode } from './navigationdisplaydata';
import { SimConnect } from '../communication/simconnect';
import { createArcModePatternMap } from './gpu/patterns/arcmode';
import { NavigationDisplayThresholdsDto } from '../dto/navigationdisplaythresholds.dto';

const sharp = require('sharp');

// mathematical conversion constants
const FeetPerNauticalMile = 6076.12;
const ThreeNauticalMilesInFeet = 18228.3;
const MetresToNauticalMiles = 1852;

// map grid creation
const InvalidElevation = 32767;
const UnknownElevation = 32766;
const WaterElevation = -1;
const DefaultTileSize = 300;

// histogram parameters
const HistogramBinRange = 100;
const HistogramMinimumElevation = -500; // some areas in the world are below water level
const HistogramMaximumElevation = 29040; // mount everest
const HistogramBinCount = Math.ceil((HistogramMaximumElevation - HistogramMinimumElevation + 1) / HistogramBinRange);
const HistogramPatchSize = 128;

// rendering parameters
const RenderingMaxPixelWidth = 768;
const RenderingMaxPixelHeight = 492;
const RenderingArcModePixelWidth = 768;
const RenderingArcModePixelHeight = 492;
const RenderingRoseModePixelWidth = 678;
const RenderingRoseModePixelHeight = 250;
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
const RenderingColorChannelCount = 4;
const RenderingMapTransitionDeltaTime = 40;
const RenderingMapTransitionDuration = 1000;
const RenderingMapUpdateTimeout = 1500;
const RenderingMapFrameValidityTime = RenderingMapTransitionDuration + RenderingMapUpdateTimeout;
const RenderingMapTransitionAngularStep = Math.round((90 / RenderingMapTransitionDuration) * RenderingMapTransitionDeltaTime);

class MapHandler {
    private simconnect: SimConnect = null;

    private worldmap: Worldmap = null;

    private gpu: GPU = null;

    public Initialized = false;

    private currentPosition: PositionData = undefined;

    private uploadWorldMapToGPU: IKernelRunShortcut = null;

    private gpuWorldMap: Texture = null;

    private uploadPatternMapToGPU: IKernelRunShortcut = null;

    private patternMap: Texture = null;

    private worldMapMetadata: {
        southwest: { latitude: number, longitude: number },
        northeast: { latitude: number, longitude: number },
        currentGridPosition: { x: number, y: number },
        width: number,
        height: number,
    } = {
        southwest: { latitude: -100, longitude: -190 },
        northeast: { latitude: -100, longitude: -190 },
        currentGridPosition: { x: 0, y: 0 },
        width: 0,
        height: 0,
    };

    private cachedTiles: number = 0;

    private worldMapCache: Int16Array = null;

    private extractLocalElevationMap: IKernelRunShortcut = null;

    private localElevationHistogram: IKernelRunShortcut = null;

    private elevationHistogram: IKernelRunShortcut = null;

    private aircraftStatus: AircraftStatus = null;

    private navigationDisplayRendering: {
        [side: string]: {
            config: NavigationDisplay,
            timeout: NodeJS.Timeout,
            durationInterval: NodeJS.Timer,
            startupTimestamp: number,
            finalMap: IKernelRunShortcut,
            lastFrame: Uint8ClampedArray,
            lastTransitionData: {
                timestamp: number,
                thresholds: NavigationDisplayThresholdsDto,
                frames: Uint8ClampedArray[],
            },
        }
    } = {}

    private onConnectionLost(): void {
        this.stopRendering();
    }

    private onPositionUpdate(data: PositionData): void {
        this.updatePosition(data, false);
    }

    private onAircraftStatusUpdate(data: AircraftStatus, startup: boolean = false): void {
        if (this.aircraftStatus === null || data.navigationDisplayRenderingMode !== this.aircraftStatus.navigationDisplayRenderingMode || this.patternMap === null) {
            switch (data.navigationDisplayRenderingMode) {
            case TerrainRenderingMode.ArcMode:
                const patternData = createArcModePatternMap();
                this.patternMap = this.uploadPatternMapToGPU(patternData, RenderingMaxPixelWidth) as Texture;
                if (startup) {
                    parentPort.postMessage({ request: 'LOGMESSAGE', response: 'ARC-mode rendering activated' });
                }
                break;
            default:
                if (startup) {
                    parentPort.postMessage({ request: 'LOGERROR', response: 'No known rendering mode selected' });
                }
                break;
            }
        }

        this.aircraftStatus = data;
        this.configureNavigationDisplay('L', this.aircraftStatus.navigationDisplayCapt, startup);
        this.configureNavigationDisplay('R', this.aircraftStatus.navigationDisplayFO, startup);
    }

    private createKernels(): void {
        this.gpu = new GPU({ mode: 'gpu' });

        // register kernel to upload the map data
        this.uploadWorldMapToGPU = this.gpu
            .createKernel(uploadTextureData, {
                argumentTypes: { texture: 'Array', width: 'Integer' },
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: true,
                tactic: 'speed',
            });

        this.uploadPatternMapToGPU = this.gpu
            .createKernel(uploadTextureData, {
                argumentTypes: { texture: 'Array', width: 'Integer' },
                dynamicArguments: true,
                dynamicOutput: false,
                pipeline: true,
                tactic: 'speed',
            })
            .setOutput([RenderingMaxPixelWidth, RenderingMaxPixelHeight]);

        // register kernel to create the local map
        this.extractLocalElevationMap = this.gpu
            .createKernel(createLocalElevationMap, {
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: true,
                tactic: 'speed',
            })
            .setConstants<LocalElevationMapConstants>({
                unknownElevation: UnknownElevation,
                invalidElevation: InvalidElevation,
            })
            .setFunctions([
                deg2rad,
                normalizeHeading,
                rad2deg,
                projectWgs84,
            ]);

        this.localElevationHistogram = this.gpu
            .createKernel(createLocalElevationHistogram, {
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: true,
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

        this.elevationHistogram = this.gpu
            .createKernel(createElevationHistogram, {
                dynamicArguments: true,
                pipeline: true,
            })
            .setLoopMaxIterations(500)
            .setOutput([HistogramBinCount]);

        /* create the sides */
        this.navigationDisplayRendering.L = {
            config: null,
            timeout: null,
            durationInterval: null,
            startupTimestamp: new Date().getTime(),
            finalMap: null,
            lastFrame: null,
            lastTransitionData: { timestamp: 0, thresholds: null, frames: [] },
        };
        this.navigationDisplayRendering.R = {
            config: null,
            timeout: null,
            durationInterval: null,
            // offset the rendering to have a more realistic bahaviour
            startupTimestamp: new Date().getTime() - 1500,
            finalMap: null,
            lastFrame: null,
            lastTransitionData: { timestamp: 0, thresholds: null, frames: [] },
        };

        for (const side in this.navigationDisplayRendering) {
            if (side in this.navigationDisplayRendering) {
                this.navigationDisplayRendering[side].finalMap = this.gpu
                    .createKernel(renderNavigationDisplay, {
                        dynamicArguments: true,
                        dynamicOutput: false,
                        pipeline: false,
                        immutable: true,
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
                        maxImageWidth: RenderingMaxPixelWidth,
                        maxImageHeight: RenderingMaxPixelHeight,
                        densityPatchSize: RenderingDensityPatchSize,
                        patternMapWidth: RenderingMaxPixelWidth,
                        patternMapHeight: RenderingMaxPixelHeight,
                    })
                    .setFunctions([
                        calculateNormalModeGreenThresholds,
                        calculateNormalModeWarningThresholds,
                        calculatePeaksModeThresholds,
                        renderNormalMode,
                        renderPeaksMode,
                        drawDensityPixel,
                    ])
                    .setOutput([RenderingMaxPixelWidth * RenderingColorChannelCount, RenderingMaxPixelHeight + 1]);
            }
        }
    }

    public initialize(terrainmap: TerrainMap): void {
        this.simconnect = new SimConnect();
        this.simconnect.addUpdateCallback('connectionLost', () => this.onConnectionLost());
        this.simconnect.addUpdateCallback('positionUpdate', (data: PositionData) => this.onPositionUpdate(data));
        this.simconnect.addUpdateCallback('aircraftStatusUpdate', (data: AircraftStatus) => this.onAircraftStatusUpdate(data));

        this.worldmap = new Worldmap(terrainmap);

        this.createKernels();

        // initial call precompile the kernels and reduce first reaction time
        const startupConfig: NavigationDisplay = {
            range: 20,
            arcMode: false,
            active: true,
            mapOffsetX: 0,
            mapWidth: RenderingMaxPixelWidth,
            mapHeight: RenderingRoseModePixelHeight,
        };
        const startupStatus: AircraftStatus = {
            adiruDataValid: true,
            latitude: 20.903682,
            longitude: -156.424148,
            altitude: 200,
            heading: 220,
            verticalSpeed: 0,
            gearIsDown: true,
            destinationDataValid: false,
            destinationLatitude: 0.0,
            destinationLongitude: 0.0,
            navigationDisplayCapt: startupConfig,
            navigationDisplayFO: startupConfig,
            navigationDisplayRenderingMode: TerrainRenderingMode.ArcMode,
        };
        const startupPosition: PositionData = {
            latitude: 20.903682,
            longitude: -156.424148,
        };

        // run all process steps to precompile the kernels
        this.onAircraftStatusUpdate(startupStatus, true);
        this.updatePosition(startupPosition, true);
        this.renderNavigationDisplay('L', true);

        // reset all initialization data
        this.worldMapMetadata = {
            southwest: { latitude: -100, longitude: -190 },
            northeast: { latitude: -100, longitude: -190 },
            currentGridPosition: { x: 0, y: 0 },
            width: 0,
            height: 0,
        };
        this.worldMapCache = null;
        this.gpuWorldMap.delete();
        this.gpuWorldMap = null;
        this.currentPosition = null;
        this.aircraftStatus = null;
        this.worldmap.resetInternalData();
        this.Initialized = true;
    }

    public shutdown(): void {
        this.Initialized = false;

        if (this.simconnect !== null) this.simconnect.terminate();

        // destroy all aircraft specific rendering
        for (const side in this.navigationDisplayRendering) {
            if (side in this.navigationDisplayRendering) {
                if (this.navigationDisplayRendering[side].timeout !== null) clearTimeout(this.navigationDisplayRendering[side].timeout);
                this.navigationDisplayRendering[side].finalMap.destroy();
            }
        }

        // destroy all generic GPU related instances
        if (this.patternMap !== null) this.patternMap.delete();
        if (this.gpuWorldMap !== null) this.gpuWorldMap.delete();
        if (this.extractLocalElevationMap !== null) this.extractLocalElevationMap.destroy();
        if (this.uploadWorldMapToGPU !== null) this.uploadWorldMapToGPU.destroy();
        if (this.localElevationHistogram !== null) this.localElevationHistogram.destroy();
        if (this.elevationHistogram !== null) this.elevationHistogram.destroy();
        if (this.uploadPatternMapToGPU !== null) this.uploadPatternMapToGPU.destroy();

        // destroy the context iteslf
        if (this.gpu !== null) this.gpu.destroy();
    }

    private updatePosition(position: PositionData, startup: boolean): void {
        if (!this.Initialized && !startup) return;
        this.currentPosition = position;
        const tiledata = this.worldmap.updatePosition(this.currentPosition);

        if (tiledata.loadlist.length !== 0 || this.cachedTiles !== tiledata.whitelist.length) {
            const [southwestLat, southwestLong] = projectWgs84(position.latitude, position.longitude, 225, this.worldmap.VisibilityRange * 1852);
            const southwestGrid = this.worldmap.worldMapIndices(southwestLat, southwestLong);
            const [northeastLat, northeastLong] = projectWgs84(position.latitude, position.longitude, 45, this.worldmap.VisibilityRange * 1852);
            const northeastGrid = this.worldmap.worldMapIndices(northeastLat, northeastLong);

            let minWidthPerTile = 5000;
            let minHeightPerTile = 5000;
            for (let { row } = northeastGrid; row >= southwestGrid.row; row--) {
                for (let { column } = southwestGrid; column <= northeastGrid.column; column++) {
                    const cell = this.worldmap.TileManager.grid[row][column];
                    if (cell.tileIndex !== -1 && cell.elevationmap.Rows !== 0 && cell.elevationmap.Columns !== 0) {
                        minWidthPerTile = Math.min(cell.elevationmap.Columns, minWidthPerTile);
                        minHeightPerTile = Math.min(cell.elevationmap.Rows, minHeightPerTile);
                    }
                }
            }

            if (minWidthPerTile === 5000) minWidthPerTile = DefaultTileSize;
            if (minHeightPerTile === 5000) minHeightPerTile = DefaultTileSize;

            const egoTileIndex = this.worldmap.worldMapIndices(this.currentPosition.latitude, this.currentPosition.longitude);
            const globalEgoOffset: { x: number, y: number } = { x: -1, y: -1 };

            const worldWidth = minWidthPerTile * (northeastGrid.column - southwestGrid.column);
            const worldHeight = minHeightPerTile * (northeastGrid.row - southwestGrid.row);
            this.worldMapCache = new Int16Array(worldWidth * worldHeight);
            let yOffset = 0;

            for (let { row } = northeastGrid; row >= southwestGrid.row; row--) {
                for (let y = 0; y < minHeightPerTile; y++) {
                    let xOffset = 0;

                    for (let { column } = southwestGrid; column <= northeastGrid.column; column++) {
                        const cell = this.worldmap.TileManager.grid[row][column];
                        for (let x = 0; x < minWidthPerTile; x++) {
                            const index = (y + yOffset) * worldWidth + xOffset + x;

                            if (cell.tileIndex === -1) {
                                this.worldMapCache[index] = WaterElevation;
                            } else if (!cell.elevationmap.MapLoaded) {
                                this.worldMapCache[index] = UnknownElevation;
                            } else {
                                this.worldMapCache[index] = cell.elevationmap.ElevationMap[y * cell.elevationmap.Columns + x];
                            }
                        }

                        if (egoTileIndex.row === row && egoTileIndex.column === column && globalEgoOffset.x < 0) {
                            const latStep = this.worldmap.GridData.latitudeStep / minHeightPerTile;
                            const longStep = this.worldmap.GridData.longitudeStep / minWidthPerTile;
                            const latDelta = this.currentPosition.latitude - cell.southwest.latitude;
                            const longDelta = this.currentPosition.longitude - cell.southwest.longitude;

                            globalEgoOffset.x = xOffset + longDelta / longStep;
                            globalEgoOffset.y = yOffset + minHeightPerTile - latDelta / latStep;
                        }

                        xOffset += minWidthPerTile;
                    }
                }

                yOffset += minHeightPerTile;
            }

            // update the world map metadata for the rendering
            this.worldMapMetadata.southwest = this.worldmap.TileManager.grid[southwestGrid.row][southwestGrid.column].southwest;
            this.worldMapMetadata.northeast = this.worldmap.TileManager.grid[northeastGrid.row][northeastGrid.column].southwest;
            this.worldMapMetadata.northeast.latitude += this.worldmap.GridData.latitudeStep;
            this.worldMapMetadata.northeast.longitude += this.worldmap.GridData.longitudeStep;
            this.worldMapMetadata.currentGridPosition = globalEgoOffset;
            this.worldMapMetadata.width = worldWidth;
            this.worldMapMetadata.height = worldHeight;

            this.uploadWorldMapToGPU = this.uploadWorldMapToGPU.setOutput([worldWidth, worldHeight]);
            this.gpuWorldMap = this.uploadWorldMapToGPU(this.worldMapCache, worldWidth) as Texture;

            this.cachedTiles = tiledata.whitelist.length;
        }
    }

    private extractElevation(latitude: number, longitude: number): number {
        if (this.worldMapCache === null || this.worldMapCache.length === 0) {
            return InvalidElevation;
        }

        // calculate the pixel movement out of the current position
        const latStep = (this.worldMapMetadata.northeast.latitude - this.worldMapMetadata.southwest.latitude) / this.worldMapMetadata.height;
        const longStep = (this.worldMapMetadata.northeast.longitude - this.worldMapMetadata.southwest.longitude) / this.worldMapMetadata.width;
        const latPixelDelta = (this.currentPosition.latitude - latitude) / latStep;
        const longPixelDelta = (longitude - this.currentPosition.longitude) / longStep;

        // calculate the map index
        let index = (this.worldMapMetadata.currentGridPosition.y + latPixelDelta) * this.worldMapMetadata.width;
        index += this.worldMapMetadata.currentGridPosition.x + longPixelDelta;
        index = Math.floor(index);

        return this.worldMapCache[index];
    }

    private configureNavigationDisplay(display: string, config: NavigationDisplay, startup: boolean): void {
        if (display in this.navigationDisplayRendering) {
            const lastConfig = this.navigationDisplayRendering[display].config;
            const startRendering = config.active === true && (lastConfig === null || lastConfig.active === false);
            const resetRendering = config.active === false || lastConfig === null || (lastConfig.arcMode !== config.arcMode);
            this.navigationDisplayRendering[display].config = config;

            if (!startup) {
                if (resetRendering) {
                    if (this.navigationDisplayRendering[display].durationInterval !== null) {
                        clearInterval(this.navigationDisplayRendering[display].durationInterval);
                        this.navigationDisplayRendering[display].durationInterval = null;
                    }
                    if (this.navigationDisplayRendering[display].timeout !== null) {
                        clearTimeout(this.navigationDisplayRendering[display].timeout);
                        this.navigationDisplayRendering[display].timeout = null;
                    }

                    this.navigationDisplayRendering[display].lastTransitionData.thresholds = null;
                    this.navigationDisplayRendering[display].lastTransitionData.timestamp = 0;
                    this.navigationDisplayRendering[display].lastTransitionData.frames = [];
                    this.navigationDisplayRendering[display].lastFrame = null;
                }

                if (startRendering || (resetRendering && config.active === true)) {
                    this.startNavigationDisplayRenderingCycle(display);
                }
            }
        }
    }

    private static fastFlatten<T>(arr: T[][]): T[] {
        const numElementsUptoIndex = Array(arr.length);
        numElementsUptoIndex[0] = 0;
        for (let i = 1; i < arr.length; i++) {
            numElementsUptoIndex[i] = numElementsUptoIndex[i - 1] + arr[i - 1].length;
        }
        const flattened = new Array(numElementsUptoIndex[arr.length - 1] + arr[arr.length - 1].length);
        let skip;
        for (let i = 0; i < arr.length; i++) {
            skip = numElementsUptoIndex[i];
            for (let j = 0; j < arr[i].length; j++) {
                flattened[skip + j] = arr[i][j];
            }
        }
        return flattened;
    }

    private createLocalElevationMap(config: NavigationDisplay): Texture {
        let metresPerPixel = Math.round((config.range * MetresToNauticalMiles) / config.mapHeight);
        if (config.arcMode) metresPerPixel *= 2.0;

        // prepare the output buffer
        if (this.extractLocalElevationMap.output === null
            || this.extractLocalElevationMap.output[0] !== config.mapWidth
            || this.extractLocalElevationMap.output[1] !== config.mapHeight
        ) {
            this.extractLocalElevationMap = this.extractLocalElevationMap.setOutput([config.mapWidth, config.mapHeight]);
        }

        // create the local elevation map
        const localElevationMap = this.extractLocalElevationMap(
            this.aircraftStatus.latitude,
            this.aircraftStatus.longitude,
            this.aircraftStatus.heading,
            this.worldMapMetadata.currentGridPosition.x,
            this.worldMapMetadata.currentGridPosition.y,
            this.gpuWorldMap,
            this.worldMapMetadata.width,
            this.worldMapMetadata.height,
            this.worldMapMetadata.southwest.latitude,
            this.worldMapMetadata.southwest.longitude,
            this.worldMapMetadata.northeast.latitude,
            this.worldMapMetadata.northeast.longitude,
            config.mapWidth,
            config.mapHeight,
            metresPerPixel,
            config.arcMode,
        ) as Texture;

        return localElevationMap;
    }

    private createElevationHistogram(localElevationMap: Texture, config: NavigationDisplay): Texture {
        // create the histogram statistics
        const patchesInX = Math.ceil(config.mapWidth / HistogramPatchSize);
        const patchesInY = Math.ceil(config.mapHeight / HistogramPatchSize);
        const patchCount = patchesInX * patchesInY;

        if (this.localElevationHistogram.output === null
            || this.localElevationHistogram.output[1] !== patchCount
        ) {
            this.localElevationHistogram = this.localElevationHistogram
                .setOutput([HistogramBinCount, patchCount]);
        }

        const localHistograms = this.localElevationHistogram(
            localElevationMap,
            config.mapWidth,
            config.mapHeight,
        ) as Texture;
        const histogram = this.elevationHistogram(
            localHistograms,
            patchCount,
        ) as Texture;

        return histogram;
    }

    private calculateAbsoluteCutOffAltitude(): number {
        if (this.aircraftStatus === null || this.aircraftStatus.destinationDataValid === false) {
            return HistogramMinimumElevation;
        }

        const destinationElevation = this.extractElevation(this.aircraftStatus.destinationLatitude, this.aircraftStatus.destinationLongitude);

        if (destinationElevation !== InvalidElevation) {
            let cutOffAltitude = RenderingCutOffAltitudeMaximum;

            const distance = distanceWgs84(
                this.currentPosition.latitude,
                this.currentPosition.longitude,
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
        side: string,
        config: NavigationDisplay,
        elevationMap: Texture,
        histogram: Texture,
        cutOffAltitude: number,
    ): KernelOutput {
        const terrainmap = this.navigationDisplayRendering[side].finalMap(
            elevationMap,
            histogram,
            this.patternMap,
            config.mapWidth,
            config.mapHeight,
            config.mapOffsetX,
            this.aircraftStatus.altitude,
            this.aircraftStatus.verticalSpeed,
            this.aircraftStatus.gearIsDown ? RenderingGearDownOffset : RenderingNonGearDownOffset,
            cutOffAltitude,
        ) as KernelOutput;

        return terrainmap;
    }

    private arcModeTransitionFrame(
        config: NavigationDisplay,
        oldFrame: Uint8ClampedArray,
        newFrame: Uint8ClampedArray,
        startAngle: number,
        endAngle: number,
    ): Uint8ClampedArray {
        const result = new Uint8ClampedArray(RenderingMaxPixelWidth * RenderingColorChannelCount * RenderingMaxPixelHeight);

        // access data as uint32-array for performance reasons
        const destination = new Uint32Array(result.buffer);
        // UInt32-version of RGBA (4, 4, 5, 255)
        destination.fill(4278518788);
        const oldSource = oldFrame !== null ? new Uint32Array(oldFrame.buffer) : null;
        const newSource = new Uint32Array(newFrame.buffer);

        let arrayIndex = 0;
        for (let y = 0; y < config.mapHeight; ++y) {
            for (let x = 0; x < RenderingMaxPixelWidth; ++x) {
                if (x >= config.mapOffsetX && x < (config.mapOffsetX + config.mapWidth)) {
                    const distance = Math.sqrt((x - RenderingMaxPixelWidth / 2) ** 2 + (config.mapHeight - y) ** 2);
                    const angle = Math.acos((config.mapHeight - y) / distance) * (180.0 / Math.PI);

                    if (startAngle <= angle && angle <= endAngle) {
                        destination[arrayIndex] = newSource[arrayIndex];
                    } else if (oldSource !== null) {
                        destination[arrayIndex] = oldSource[arrayIndex];
                    }
                }

                arrayIndex++;
            }
        }

        return result;
    }

    private arcModeTransition(side: string, config: NavigationDisplay, frameData: Uint8ClampedArray, thresholdData: NavigationDisplayData): void {
        const transitionFrames: Uint8ClampedArray[] = [];

        let startAngle = 0;
        if (this.navigationDisplayRendering[side].lastFrame === null) {
            const timeSinceStart = new Date().getTime() - this.navigationDisplayRendering[side].startupTimestamp;
            const frameUpdateCount = timeSinceStart / RenderingMapFrameValidityTime;
            const ratioSinceLastFrame = frameUpdateCount - Math.floor(frameUpdateCount);
            startAngle = Math.floor(90 * ratioSinceLastFrame);
        }

        let angle = 0;
        let lastFrame = null;
        this.navigationDisplayRendering[side].durationInterval = setInterval(() => {
            angle += RenderingMapTransitionAngularStep;
            let stopInterval = false;
            let frame = null;

            if (angle < 90) {
                frame = this.arcModeTransitionFrame(config, this.navigationDisplayRendering[side].lastFrame, frameData, startAngle, angle);
            } else {
                stopInterval = true;

                // do not overwrite the last frame of the initialization
                if (startAngle === 0) {
                    this.navigationDisplayRendering[side].lastFrame = frameData;
                    frame = frameData;
                } else {
                    this.navigationDisplayRendering[side].lastFrame = lastFrame;
                }
            }

            // transfer the transition frame
            if (frame !== null) {
                sharp(frame, { raw: { width: RenderingMaxPixelWidth, height: RenderingMaxPixelHeight, channels: RenderingColorChannelCount } })
                    .png()
                    .toBuffer()
                    .then((buffer) => {
                        thresholdData.FrameByteCount = buffer.byteLength;
                        this.simconnect.sendNavigationDisplayTerrainMapMetadata(side, thresholdData);
                        this.simconnect.sendNavigationDisplayTerrainMapFrame(side, buffer);

                        // store the data for the web UI
                        transitionFrames.push(new Uint8ClampedArray(buffer));
                    });
            }

            if (stopInterval) {
                clearInterval(this.navigationDisplayRendering[side].durationInterval);
                this.navigationDisplayRendering[side].durationInterval = null;

                this.navigationDisplayRendering[side].lastTransitionData.timestamp = new Date().getTime();
                this.navigationDisplayRendering[side].lastTransitionData.frames = transitionFrames;
                this.navigationDisplayRendering[side].lastTransitionData.thresholds = {
                    minElevation: thresholdData.MinimumElevation,
                    minElevationIsWarning: thresholdData.MinimumElevationMode === TerrainLevelMode.Warning,
                    minElevationIsCaution: thresholdData.MinimumElevationMode === TerrainLevelMode.Caution,
                    maxElevation: thresholdData.MaximumElevation,
                    maxElevationIsWarning: thresholdData.MaximumElevationMode === TerrainLevelMode.Warning,
                    maxElevationIsCaution: thresholdData.MaximumElevationMode === TerrainLevelMode.Warning,
                };

                this.navigationDisplayRendering[side].timeout = setTimeout(() => this.renderNavigationDisplay(side), RenderingMapUpdateTimeout);
            }

            lastFrame = frame;
        }, RenderingMapTransitionDeltaTime);
    }

    private renderNavigationDisplay(side: string, startup: boolean = false): void {
        if (this.navigationDisplayRendering[side].timeout !== null) {
            clearTimeout(this.navigationDisplayRendering[side].timeout);
            this.navigationDisplayRendering[side].timeout = null;
        }
        if (this.navigationDisplayRendering[side].durationInterval !== null) {
            clearInterval(this.navigationDisplayRendering[side].durationInterval);
            this.navigationDisplayRendering[side].durationInterval = null;
        }

        // no valid position data received
        if (this.currentPosition === undefined) {
            parentPort.postMessage({ request: 'LOGWARN', response: 'No valid position received for rendering' });
        } else if (this.navigationDisplayRendering[side].config === undefined) {
            parentPort.postMessage({ request: 'LOGWARN', response: 'No navigation display configuration received' });
        } else {
            const { config } = this.navigationDisplayRendering[side];
            config.mapWidth = config.arcMode ? RenderingArcModePixelWidth : RenderingRoseModePixelWidth;
            config.mapHeight = config.arcMode ? RenderingArcModePixelHeight : RenderingRoseModePixelHeight;
            config.mapOffsetX = Math.round((RenderingMaxPixelWidth - config.mapWidth) * 0.5);

            const elevationMap = this.createLocalElevationMap(config);
            const histogram = this.createElevationHistogram(elevationMap, config);

            const cutOffAltitude = this.calculateAbsoluteCutOffAltitude();

            // create the final map
            const renderingData = this.createNavigationDisplayMap(side, config, elevationMap, histogram, cutOffAltitude);
            const frame = renderingData as number[][];
            const metadata = frame.splice(frame.length - 1)[0];
            const imageData = new Uint8ClampedArray(MapHandler.fastFlatten(frame));

            // send the threshold data for the map
            const thresholdData = this.analyzeMetadata(metadata, cutOffAltitude);
            thresholdData.ImageWidth = config.mapWidth;
            thresholdData.ImageHeight = config.mapHeight;

            if (!startup) {
                switch (this.aircraftStatus.navigationDisplayRenderingMode) {
                case TerrainRenderingMode.ArcMode:
                    this.arcModeTransition(side, config, imageData, thresholdData);
                    break;
                default:
                    parentPort.postMessage({ request: 'LOGERROR', response: `Unknown rendering mode defined: ${this.aircraftStatus.navigationDisplayRenderingMode}` });
                    break;
                }
            }
        }
    }

    public startNavigationDisplayRenderingCycle(side: string): void {
        if (this.navigationDisplayRendering[side].timeout !== null) {
            clearTimeout(this.navigationDisplayRendering[side].timeout);
            this.navigationDisplayRendering[side].timeout = null;
        }

        if (side in this.navigationDisplayRendering) {
            this.renderNavigationDisplay(side);
        }
    }

    public stopRendering(): void {
        if (this.navigationDisplayRendering.L.config !== null) {
            this.navigationDisplayRendering.L.config.active = false;
        }
        if (this.navigationDisplayRendering.L.durationInterval !== null) {
            clearInterval(this.navigationDisplayRendering.L.durationInterval);
            this.navigationDisplayRendering.L.durationInterval = null;
        }
        if (this.navigationDisplayRendering.L.timeout !== null) {
            clearTimeout(this.navigationDisplayRendering.L.timeout);
            this.navigationDisplayRendering.L.timeout = null;
        }
        this.navigationDisplayRendering.L.lastFrame = null;

        if (this.navigationDisplayRendering.R.config !== null) {
            this.navigationDisplayRendering.R.config.active = false;
        }
        if (this.navigationDisplayRendering.R.durationInterval !== null) {
            clearInterval(this.navigationDisplayRendering.R.durationInterval);
            this.navigationDisplayRendering.R.durationInterval = null;
        }
        if (this.navigationDisplayRendering.R.timeout !== null) {
            clearTimeout(this.navigationDisplayRendering.R.timeout);
            this.navigationDisplayRendering.R.timeout = null;
        }
        this.navigationDisplayRendering.R.lastFrame = null;
    }

    public frameData(side: string): { timestamp: number, thresholds: NavigationDisplayThresholdsDto, frames: Uint8ClampedArray[] } {
        if (side in this.navigationDisplayRendering) {
            return this.navigationDisplayRendering[side].lastTransitionData;
        }

        return { timestamp: 0, thresholds: null, frames: [] };
    }
}

const maphandler = new MapHandler();

parentPort.on('message', (data: { type: string, instance: any }) => {
    if (data.type === 'INITIALIZATION') {
        maphandler.initialize(data.instance as TerrainMap);
        parentPort.postMessage({ request: data.type, response: maphandler.Initialized });
    } else if (data.type === 'FRAME_DATA_TIMESTAMP') {
        parentPort.postMessage({ request: data.type, response: { side: data.instance, timestamp: maphandler.frameData(data.instance as string).timestamp } });
    } else if (data.type === 'FRAME_DATA_THRESHOLDS') {
        parentPort.postMessage({ request: data.type, response: { side: data.instance, thresholds: maphandler.frameData(data.instance as string).thresholds } });
    } else if (data.type === 'FRAME_DATA') {
        parentPort.postMessage({ request: data.type, response: { side: data.instance, data: maphandler.frameData(data.instance as string) } });
    } else if (data.type === 'STOP_RENDERING') {
        maphandler.stopRendering();
    } else if (data.type === 'SHUTDOWN') {
        maphandler.shutdown();
        parentPort.postMessage({ request: data.type, response: undefined });
    }
});
