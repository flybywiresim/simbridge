import { parentPort } from 'worker_threads';
import { GPU, IKernelRunShortcut, Texture } from 'gpu.js';
import { a32nxDrawHighDensityPixel } from './gpu/A32NX/highdensitypixel';
import { a32nxDrawLowDensityPixel } from './gpu/A32NX/lowdensitypixel';
import { a32nxDrawWaterDensityPixel } from './gpu/A32NX/waterpixel';
import { NavigationDisplayViewDto } from '../dto/navigationdisplayview.dto';
import { PositionDto } from '../dto/position.dto';
import { TerrainMap } from '../fileformat/terrainmap';
import { Worldmap } from '../mapdata/worldmap';
import { deg2rad, distanceWgs84, rad2deg } from './generic/helper';
import { createLocalElevationMap } from './gpu/elevationmap';
import { normalizeHeading, projectWgs84 } from './gpu/helper';
import {
    a32nxCalculateNormalModeGreenThresholds,
    a32nxCalculateNormalModeWarningThresholds,
    a32nxCalculatePeaksModeThresholds,
    a32nxRenderNavigationDisplay,
    a32nxRenderNormalMode,
    a32nxRenderPeaksMode,
} from './gpu/A32NX/navigationdisplay';
import { a32nxInitialNavigationDisplayTransition, a32nxUpdateNavigationDisplayTransition } from './gpu/A32NX/transition';
import { HistogramConstants, LocalElevationMapConstants, NavigationDisplayConstants } from './gpu/interfaces';
import { createElevationHistogram, createLocalElevationHistogram } from './gpu/statistics';
import { uploadElevationmap } from './gpu/upload';
import { NavigationDisplayData, TerrainLevelMode } from './navigationdisplaydata';
import { SimConnect } from './simconnect';

const sharp = require('sharp');

// mathematical conversion constants
const FeetPerNauticalMile = 6076.12;
const ThreeNauticalMilesInFeet = 18228.3;

// debugging parameters
const DebugWorldCache = false;
const DebugLocalElevationMap = false;
const DebugHistogram = false;
const DebugCutOffAltitude = false;
const DebugRendering = true;
const DebugTransition = true;

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
const RenderingMaxNavigationDisplayHeight = 492;
const RenderingMaxNavigationDisplayWidth = 768;
const RenderingColorChannelCount = 3;

// transition parameters
const TransitionFPS = 10;
const TransitionDuration = 1.5;
const TransitionUpdateDelay = Math.floor(1000 / TransitionFPS);
const MapUpdateCycletime = 2000;

class MapHandler {
    private simconnect: SimConnect = null;

    private worldmap: Worldmap = null;

    private gpu: GPU = null;

    public Initialized = false;

    private currentPosition: PositionDto = null;

    private uploadWorldMapToGPU: IKernelRunShortcut = null;

    private gpuWorldMap: Texture = null;

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

    private navigationDisplayData: { [id: string]: { config: NavigationDisplayViewDto, lastFrame: Texture } } = {};

    private extractLocalElevationMap: IKernelRunShortcut = null;

    private localElevationHistogram: IKernelRunShortcut = null;

    private elevationHistogram: IKernelRunShortcut = null;

    private a32nxNavigationDisplayRendering: {
        finalMap: IKernelRunShortcut,
        initialTransition: IKernelRunShortcut,
        updateTransition: IKernelRunShortcut,
    } = {
        finalMap: null,
        initialTransition: null,
        updateTransition: null,
    }

    private startupTimestamp: number = -1;

    private createKernels(): void {
        this.gpu = new GPU({ mode: 'gpu' });

        // register kernel to upload the map data
        this.uploadWorldMapToGPU = this.gpu
            .createKernel(uploadElevationmap, {
                argumentTypes: { texture: 'Array', width: 'Integer' },
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: true,
                tactic: 'speed',
            });

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
                screenWidth: RenderingMaxNavigationDisplayWidth,
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
                screenWidth: RenderingMaxNavigationDisplayWidth,
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

        this.a32nxNavigationDisplayRendering.finalMap = this.gpu
            .createKernel(a32nxRenderNavigationDisplay, {
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: true,
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
                densityPatchSize: RenderingDensityPatchSize,
            })
            .setFunctions([
                a32nxCalculateNormalModeGreenThresholds,
                a32nxCalculateNormalModeWarningThresholds,
                a32nxCalculatePeaksModeThresholds,
                a32nxRenderNormalMode,
                a32nxRenderPeaksMode,
                a32nxDrawHighDensityPixel,
                a32nxDrawLowDensityPixel,
                a32nxDrawWaterDensityPixel,
            ]);

        this.a32nxNavigationDisplayRendering.initialTransition = this.gpu
            .createKernel(a32nxInitialNavigationDisplayTransition, {
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: false,
                immutable: false,
            })
            .setFunctions([
                rad2deg,
            ]);

        this.a32nxNavigationDisplayRendering.updateTransition = this.gpu
            .createKernel(a32nxUpdateNavigationDisplayTransition, {
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: false,
                immutable: false,
            })
            .setFunctions([
                rad2deg,
            ]);
    }

    public initialize(terrainmap: TerrainMap): void {
        this.simconnect = new SimConnect({
            maxNavigationDisplayHeight: RenderingMaxNavigationDisplayHeight,
            maxNavigationDisplayWidth: RenderingMaxNavigationDisplayWidth,
            colorChannelCount: RenderingColorChannelCount,
        });

        this.worldmap = new Worldmap(terrainmap);

        this.createKernels();

        // initial call precompile the kernels and reduce first reaction time
        const startupPosition: PositionDto = {
            latitude: 0,
            longitude: 0,
            altitude: 3000,
            heading: 360,
            verticalSpeed: 0,
        };
        this.updatePosition(startupPosition, true);
        const startupConfig: NavigationDisplayViewDto = {
            active: true,
            mapHeight: 20,
            meterPerPixel: 0,
            mapTransitionFps: 2,
            mapTransitionTime: 1,
            arcMode: true,
            gearDown: false,
        };
        const map = this.createLocalElevationMap(startupConfig);
        const histogram = this.createElevationHistogram(map, startupConfig);
        const display = this.createNavigationDisplayMap(startupConfig, map, histogram, 0);
        this.createNavigationDisplayTransitionFrame(null, display, startupConfig, 20.0);
        this.createNavigationDisplayTransitionFrame(display, display, startupConfig, 20.0);

        this.startupTimestamp = new Date().getTime();
        this.Initialized = true;
    }

    public shutdown(): void {
        this.Initialized = false;

        if (this.simconnect !== null) this.simconnect.terminate();

        // destroy all generic GPU related instances
        if (this.gpuWorldMap !== null) this.gpuWorldMap.delete();
        if (this.extractLocalElevationMap !== null) this.extractLocalElevationMap.destroy();
        if (this.uploadWorldMapToGPU !== null) this.uploadWorldMapToGPU.destroy();
        if (this.localElevationHistogram !== null) this.localElevationHistogram.destroy();
        if (this.elevationHistogram !== null) this.elevationHistogram.destroy();

        // destroy all A32NX related instances
        if (this.a32nxNavigationDisplayRendering.finalMap !== null) this.a32nxNavigationDisplayRendering.finalMap.destroy();
        if (this.a32nxNavigationDisplayRendering.initialTransition !== null) this.a32nxNavigationDisplayRendering.initialTransition.destroy();
        if (this.a32nxNavigationDisplayRendering.updateTransition !== null) this.a32nxNavigationDisplayRendering.updateTransition.destroy();

        // destroy the context iteslf
        if (this.gpu !== null) this.gpu.destroy();
    }

    public updatePosition(position: PositionDto, startup: boolean): void {
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

            if (DebugWorldCache) {
                let maxElevation = 0;
                this.worldMapCache.forEach((entry) => {
                    maxElevation = Math.max(entry, maxElevation);
                });

                const image = new Uint8ClampedArray(this.worldMapCache.length);
                this.worldMapCache.forEach((entry, index) => {
                    const gray = Math.max(Math.min((entry / maxElevation) * 255, 255), 0);
                    image[index] = gray;
                });

                console.log(`World dimension: ${worldWidth}x${worldHeight}`);
                sharp(image, { raw: { width: worldWidth, height: worldHeight, channels: 1 } })
                    .png()
                    .toFile('worldelevation.png');
            }
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

    public configureNavigationDisplay(display: string, config: NavigationDisplayViewDto): void {
        // ensure that the cut off values are set
        if (config.cutOffAltitudeMinimimum === undefined || config.cutOffAltitudeMaximum === undefined) {
            config.cutOffAltitudeMinimimum = 200;
            config.cutOffAltitudeMaximum = 400;
        }

        if (display in this.navigationDisplayData) {
            if (this.navigationDisplayData[display].config.arcMode !== config.arcMode || config.active === false) {
                this.navigationDisplayData[display].lastFrame = null;
            }
            this.navigationDisplayData[display].config = config;
        } else {
            this.navigationDisplayData[display] = {
                config,
                lastFrame: null,
            };
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

    private createLocalElevationMap(config: NavigationDisplayViewDto): Texture {
        // prepare the output buffer
        if (this.extractLocalElevationMap.output === null
            || this.extractLocalElevationMap.output[0] !== RenderingMaxNavigationDisplayWidth
            || this.extractLocalElevationMap.output[1] !== config.mapHeight
        ) {
            this.extractLocalElevationMap = this.extractLocalElevationMap.setOutput([RenderingMaxNavigationDisplayWidth, config.mapHeight]);
        }

        // create the local elevation map
        const localElevationMap = this.extractLocalElevationMap(
            this.currentPosition.latitude,
            this.currentPosition.longitude,
            this.currentPosition.heading,
            this.worldMapMetadata.currentGridPosition.x,
            this.worldMapMetadata.currentGridPosition.y,
            this.gpuWorldMap,
            this.worldMapMetadata.width,
            this.worldMapMetadata.height,
            this.worldMapMetadata.southwest.latitude,
            this.worldMapMetadata.southwest.longitude,
            this.worldMapMetadata.northeast.latitude,
            this.worldMapMetadata.northeast.longitude,
            config.mapHeight,
            config.meterPerPixel,
            config.arcMode,
        ) as Texture;

        if (DebugLocalElevationMap) {
            const map = MapHandler.fastFlatten(localElevationMap.toArray() as number[][]);

            let maxElevation = 0;
            map.forEach((entry) => {
                maxElevation = Math.max(entry, maxElevation);
            });

            const image = new Uint8ClampedArray(map.length);
            map.forEach((entry, index) => {
                const gray = Math.max(Math.min((entry / maxElevation) * 255, 255), 0);
                image[index] = gray;
            });

            sharp(image, { raw: { width: RenderingMaxNavigationDisplayWidth, height: config.mapHeight, channels: 1 } })
                .png()
                .toFile('localelevationmap.png');
        }

        return localElevationMap;
    }

    private createElevationHistogram(localElevationMap: Texture, config: NavigationDisplayViewDto): Texture {
        // create the histogram statistics
        const patchesInX = Math.ceil(RenderingMaxNavigationDisplayWidth / HistogramPatchSize);
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
            config.mapHeight,
        ) as Texture;
        const histogram = this.elevationHistogram(
            localHistograms,
            patchCount,
        ) as Texture;

        if (DebugHistogram) {
            let entryCount = 0;
            (histogram.toArray() as number[]).forEach((entry, index) => {
                if (entry !== 0) {
                    const lowerElevation = index * HistogramBinRange + HistogramMinimumElevation;
                    const upperElevation = (index + 1) * HistogramBinRange + HistogramMinimumElevation;
                    console.log(`[${lowerElevation}, ${upperElevation}[ = ${entry}`);
                    entryCount += entry;
                }
            });
            console.log(`${entryCount} of ${config.mapHeight * RenderingMaxNavigationDisplayWidth} px`);
        }

        return histogram;
    }

    private calculateAbsoluteCutOffAltitude(
        destinationLatitude: number | undefined,
        destinationLongitude: number | undefined,
        cutOffAltitudeMinimimum: number,
        cutOffAltitudeMaximum: number,
    ): number {
        if (destinationLatitude === undefined
            || destinationLongitude === undefined
        ) {
            return HistogramMinimumElevation;
        }

        const destinationElevation = this.extractElevation(destinationLatitude, destinationLongitude);

        if (destinationElevation !== InvalidElevation) {
            let cutOffAltitude = cutOffAltitudeMaximum;

            const distance = distanceWgs84(
                this.currentPosition.latitude,
                this.currentPosition.longitude,
                destinationLatitude,
                destinationLongitude,
            );
            if (distance <= RenderingMaxAirportDistance) {
                const distanceFeet = distance * FeetPerNauticalMile;
                if (DebugCutOffAltitude) {
                    console.log(`Distance to destination: ${distance}`);
                    console.log(`Destination elevation: ${destinationElevation}`);
                    console.log(`Altitude: ${this.currentPosition.altitude}`);
                }

                // calculate the glide until touchdown
                const opposite = this.currentPosition.altitude - destinationElevation;
                let glideRadian = 0.0;
                if (opposite > 0 && distance > 0) {
                    // calculate the glide slope, opposite [ft] -> distance needs to be converted to feet
                    glideRadian = Math.atan(opposite / distanceFeet);
                }
                if (DebugCutOffAltitude) console.log(`Glide slope: ${rad2deg(glideRadian)}`);

                // check if the glide is greater or equal 3°
                if (glideRadian < 0.0523599) {
                    if (DebugCutOffAltitude) console.log('Glide slope based cut off altitude');
                    if (distance <= 1.0 || glideRadian === 0.0) {
                        // use the minimum value close to the airport
                        cutOffAltitude = cutOffAltitudeMinimimum;
                        if (DebugCutOffAltitude) console.log('Use minimum cut off altitude');
                    } else {
                        // use a linear model from max to min for 4 nm to 1 nm
                        const slope = (cutOffAltitudeMinimimum - cutOffAltitudeMaximum) / ThreeNauticalMilesInFeet;
                        cutOffAltitude = Math.round(slope * (distanceFeet - FeetPerNauticalMile) + cutOffAltitudeMaximum);

                        // ensure that we are not below the minimum and not above the maximum
                        cutOffAltitude = Math.max(cutOffAltitude, cutOffAltitudeMinimimum);
                        cutOffAltitude = Math.min(cutOffAltitude, cutOffAltitudeMaximum);
                    }
                }
            }

            if (DebugCutOffAltitude) console.log(`Cut off altitude: ${cutOffAltitude}`);
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
        config: NavigationDisplayViewDto,
        elevationMap: Texture,
        histogram: Texture,
        cutOffAltitude: number,
    ): Texture {
        if (this.a32nxNavigationDisplayRendering.finalMap.output === null
            || (RenderingMaxNavigationDisplayWidth * RenderingColorChannelCount) !== this.a32nxNavigationDisplayRendering.finalMap.output[0]
            || config.mapHeight + 1 !== this.a32nxNavigationDisplayRendering.finalMap.output[1]
        ) {
            // add one row for the metadata
            this.a32nxNavigationDisplayRendering.finalMap = this.a32nxNavigationDisplayRendering.finalMap
                .setOutput([RenderingMaxNavigationDisplayWidth * 3, config.mapHeight + 1]);
        }

        const terrainmap = this.a32nxNavigationDisplayRendering.finalMap(
            elevationMap,
            histogram,
            RenderingMaxNavigationDisplayWidth,
            config.mapHeight,
            this.currentPosition.altitude,
            this.currentPosition.verticalSpeed,
            config.gearDown ? RenderingGearDownOffset : RenderingNonGearDownOffset,
            cutOffAltitude,
        ) as Texture;

        if (DebugRendering) {
            const image = new Uint8ClampedArray(MapHandler.fastFlatten(terrainmap.toArray() as number[][]));
            sharp(image, { raw: { width: RenderingMaxNavigationDisplayWidth, height: config.mapHeight, channels: 3 } })
                .png()
                .toFile('navigationdisplay.png');
        }

        return terrainmap;
    }

    private createNavigationDisplayTransitionFrame(
        lastFrame: Texture,
        nextFrame: Texture,
        config: NavigationDisplayViewDto,
        angleThreshold: number,
    ): void {
        let frame: number[][] = null;

        if (lastFrame === null) {
            if (this.a32nxNavigationDisplayRendering.initialTransition.output === null
                || this.a32nxNavigationDisplayRendering.initialTransition.output[0] !== RenderingMaxNavigationDisplayWidth * RenderingColorChannelCount
                || this.a32nxNavigationDisplayRendering.initialTransition.output[1] !== config.mapHeight
            ) {
                this.a32nxNavigationDisplayRendering.initialTransition.setOutput([
                    RenderingMaxNavigationDisplayWidth * RenderingColorChannelCount,
                    config.mapHeight,
                ]);
            }

            frame = this.a32nxNavigationDisplayRendering.initialTransition(
                nextFrame,
                RenderingMaxNavigationDisplayWidth,
                config.mapHeight,
                angleThreshold,
            ) as number[][];
        } else {
            if (this.a32nxNavigationDisplayRendering.updateTransition.output === null
                || this.a32nxNavigationDisplayRendering.updateTransition.output[0] !== RenderingMaxNavigationDisplayWidth * RenderingColorChannelCount
                || this.a32nxNavigationDisplayRendering.updateTransition.output[1] !== config.mapHeight
            ) {
                this.a32nxNavigationDisplayRendering.updateTransition.setOutput([
                    RenderingMaxNavigationDisplayWidth * RenderingColorChannelCount,
                    config.mapHeight,
                ]);
            }

            frame = this.a32nxNavigationDisplayRendering.updateTransition(
                lastFrame,
                nextFrame,
                RenderingMaxNavigationDisplayWidth,
                config.mapHeight,
                angleThreshold,
            ) as number[][];
        }

        if (DebugTransition) {
            const image = new Uint8ClampedArray(MapHandler.fastFlatten(frame));
            sharp(image, { raw: { width: RenderingMaxNavigationDisplayWidth, height: config.mapHeight, channels: 3 } })
                .png()
                .toFile(`${lastFrame === null ? 'initial' : 'update'}_${Math.round(angleThreshold)}.png`);
        }
    }

    public renderNavigationDisplay(side: string): void {
        // no valid position data received
        if (this.currentPosition === undefined) {
            console.log('No valid position received for rendering');
        } else if (this.navigationDisplayData[side] === undefined) {
            console.log('No navigation display configuration received');
        } else {
            const { config } = this.navigationDisplayData[side];

            const elevationMap = this.createLocalElevationMap(config);
            const histogram = this.createElevationHistogram(elevationMap, config);

            const cutOffAltitude = this.calculateAbsoluteCutOffAltitude(
                config.destinationLatitude,
                config.destinationLongitude,
                config.cutOffAltitudeMinimimum,
                config.cutOffAltitudeMaximum,
            );

            // create the final map
            const renderingData = this.createNavigationDisplayMap(config, elevationMap, histogram, cutOffAltitude);

            // calculate the map transitions
            const frameCount = Math.ceil(TransitionFPS * TransitionDuration);
            const angleStep = Math.ceil(90.0 / frameCount);
            let counter = 0;

            const interval = setInterval(() => {
                if (counter >= frameCount) {
                    clearInterval(interval);

                    // store the map for the next run
                    this.navigationDisplayData[side].lastFrame = renderingData.clone();

                    // TODO send last frame
                } else {
                    // TODO update does not work well
                    this.createNavigationDisplayTransitionFrame(this.navigationDisplayData[side].lastFrame, renderingData, config, angleStep * counter);
                    counter += 1;
                }
            }, TransitionUpdateDelay);
        }
    }
}

// TODO
// - test SimConnect to send images
// - simulate internal timings per ND
// - offset second screen based on random number between Cycle duration
// - update and render based on timings

const maphandler = new MapHandler();

parentPort.on('message', (data: { type: string, instance: any }) => {
    if (data.type === 'INITIALIZATION') {
        maphandler.initialize(data.instance as TerrainMap);
        parentPort.postMessage({ request: data.type, response: maphandler.Initialized });
    } else if (data.type === 'POSITION') {
        maphandler.updatePosition(data.instance as PositionDto, false);
        parentPort.postMessage({ request: data.type, response: undefined });
    } else if (data.type === 'NDCONFIGURATION') {
        maphandler.configureNavigationDisplay(data.instance.side as string, data.instance.config as NavigationDisplayViewDto);
        parentPort.postMessage({ request: data.type, response: undefined });
    } else if (data.type === 'NDRENDER') {
        maphandler.renderNavigationDisplay(data.instance as string);
        parentPort.postMessage({ request: data.type, response: undefined });
    } else if (data.type === 'SHUTDOWN') {
        maphandler.shutdown();
        parentPort.postMessage({ request: data.type, response: undefined });
    }
});
