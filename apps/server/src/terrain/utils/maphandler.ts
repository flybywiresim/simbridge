import { parentPort } from 'worker_threads';
import { GPU, IKernelRunShortcut, KernelOutput, Texture } from 'gpu.js';
import { WGS84 } from './wgs84';
import { NavigationDisplayViewDto } from '../dto/navigationdisplayview.dto';
import { PositionDto } from '../dto/position.dto';
import { distanceWgs84, rad2deg } from './generic/helper';
import { createLocalElevationMap } from './gpu/elevationmap';
import { registerHelperFunctions } from './gpu/helper';
import { registerNavigationDisplayFunctions, renderNavigationDisplay } from './gpu/navigationdisplay';
import { HistogramConstants, LocalElevationMapConstants, NavigationDisplayConstants } from './gpu/interfaces';
import { createElevationHistogram, createLocalElevationHistogram } from './gpu/statistics';
import { Worldmap } from '../manager/worldmap';
import { TerrainMap } from '../mapformat/terrainmap';

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

function uploadElevationmap(texture: number[], width: number): number {
    return texture[this.thread.y * width + this.thread.x];
}

class MapHandler {
    private worldmap: Worldmap = null;

    private gpu: GPU = null;

    private initialized = false;

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

    private navigationDisplayConfigurations: { [id: string]: NavigationDisplayViewDto } = {};

    private extractLocalElevationMap: IKernelRunShortcut = null;

    private localElevationHistogram: IKernelRunShortcut = null;

    private elevationHistogram: IKernelRunShortcut = null;

    private navigationDisplayRendering: IKernelRunShortcut = null;

    private lastNavigationDisplayMap: Texture = null;

    private createKernels(): void {
        this.gpu = new GPU({ mode: 'gpu' });

        registerHelperFunctions(this.gpu);
        registerNavigationDisplayFunctions(this.gpu);

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
            });

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

        this.navigationDisplayRendering = this.gpu
            .createKernel(renderNavigationDisplay, {
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
            });
    }

    public initialize(terrainmap: TerrainMap): void {
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
            mapWidth: 300,
            mapHeight: 100,
            meterPerPixel: 0,
            mapTransitionFps: 10,
            mapTransitionTime: 1,
            arcMode: true,
            gearDown: false,
        };
        const map = this.createLocalElevationMap(startupConfig);
        const histogram = this.createElevationHistogram(map, startupConfig);
        this.createNavigationDisplayMap(startupConfig, map, histogram, 0);

        this.initialized = true;
    }

    public shutdown(): void {
        this.initialized = false;

        // destroy all GPU related instances
        if (this.gpuWorldMap !== null) this.gpuWorldMap.delete();
        if (this.extractLocalElevationMap !== null) this.extractLocalElevationMap.destroy();
        if (this.uploadWorldMapToGPU !== null) this.uploadWorldMapToGPU.destroy();
        if (this.localElevationHistogram !== null) this.localElevationHistogram.destroy();
        if (this.elevationHistogram !== null) this.elevationHistogram.destroy();
        if (this.lastNavigationDisplayMap !== null) this.lastNavigationDisplayMap.delete();
        if (this.navigationDisplayRendering !== null) this.navigationDisplayRendering.destroy();
        if (this.gpu !== null) this.gpu.destroy();
    }

    public updatePosition(position: PositionDto, startup: boolean): void {
        if (!this.initialized && !startup) return;

        this.currentPosition = position;
        const tiledata = this.worldmap.updatePosition(this.currentPosition);

        if (tiledata.loadlist.length !== 0 || this.cachedTiles !== tiledata.whitelist.length) {
            const southwest = WGS84.project(position.latitude, position.longitude, this.worldmap.VisibilityRange * 1852, 225);
            const southwestGrid = this.worldmap.worldMapIndices(southwest.latitude, southwest.longitude);
            const northeast = WGS84.project(position.latitude, position.longitude, this.worldmap.VisibilityRange * 1852, 45);
            const northeastGrid = this.worldmap.worldMapIndices(northeast.latitude, northeast.longitude);

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

        this.navigationDisplayConfigurations[display] = config;
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
            || this.extractLocalElevationMap.output[0] !== config.mapWidth
            || this.extractLocalElevationMap.output[1] !== config.mapHeight
        ) {
            this.extractLocalElevationMap = this.extractLocalElevationMap.setOutput([config.mapWidth, config.mapHeight]);
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
            config.mapWidth,
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

            sharp(image, { raw: { width: config.mapWidth, height: config.mapHeight, channels: 1 } })
                .png()
                .toFile('localelevationmap.png');
        }

        return localElevationMap;
    }

    private createElevationHistogram(localElevationMap: Texture, config: NavigationDisplayViewDto): Texture {
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
            console.log(`${entryCount} of ${config.mapHeight * config.mapWidth} px`);
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

    private createNavigationDisplayMap(
        config: NavigationDisplayViewDto,
        elevationMap: Texture,
        histogram: Texture,
        cutOffAltitude: number,
    ): Texture {
        if (this.navigationDisplayRendering.output === null
            || config.mapWidth * 4 !== this.navigationDisplayRendering.output[0]
            || config.mapHeight !== this.navigationDisplayRendering.output[1]
        ) {
            this.navigationDisplayRendering = this.navigationDisplayRendering
                .setOutput([config.mapWidth * 4, config.mapHeight]);
        }

        const terrainmap = this.navigationDisplayRendering(
            elevationMap,
            histogram,
            config.mapWidth,
            config.mapHeight,
            this.currentPosition.altitude,
            this.currentPosition.verticalSpeed,
            config.gearDown ? RenderingGearDownOffset : RenderingNonGearDownOffset,
            cutOffAltitude,
        ) as Texture;

        if (DebugRendering) {
            const image = new Uint8ClampedArray(MapHandler.fastFlatten(terrainmap.toArray() as number[][]));
            sharp(image, { raw: { width: config.mapWidth, height: config.mapHeight, channels: 4 } })
                .png()
                .toFile('navigationdisplay.png');
        }

        return terrainmap;
    }

    public renderNavigationDisplay(side: string): void {
        // no valid position data received
        if (this.currentPosition === undefined) {
            console.log('No valid position received for rendering');
            parentPort.postMessage(undefined);
        } else if (this.navigationDisplayConfigurations[side] === undefined) {
            console.log('No navigation display configuration received');
        } else {
            const config = this.navigationDisplayConfigurations[side];

            const elevationMap = this.createLocalElevationMap(config);
            const histogram = this.createElevationHistogram(elevationMap, config);

            const cutOffAltitude = this.calculateAbsoluteCutOffAltitude(
                config.destinationLatitude,
                config.destinationLongitude,
                config.cutOffAltitudeMinimimum,
                config.cutOffAltitudeMaximum,
            );

            const ndMap = this.createNavigationDisplayMap(config, elevationMap, histogram, cutOffAltitude);

            // store the map for the next run
            if (this.lastNavigationDisplayMap !== null) this.lastNavigationDisplayMap.delete();
            this.lastNavigationDisplayMap = ndMap.clone();

            parentPort.postMessage(undefined);
        }
    }
}

const maphandler = new MapHandler();

parentPort.on('message', (data: { type: string, instance: any }) => {
    if (data.type === 'INITIALIZATION') {
        maphandler.initialize(data.instance as TerrainMap);
        parentPort.postMessage(undefined);
    } else if (data.type === 'POSITION') {
        maphandler.updatePosition(data.instance as PositionDto, false);
    } else if (data.type === 'NDCONFIGURATION') {
        maphandler.configureNavigationDisplay(data.instance.side as string, data.instance.config as NavigationDisplayViewDto);
    } else if (data.type === 'NDRENDER') {
        maphandler.renderNavigationDisplay(data.instance as string);
    } else if (data.type === 'SHUTDOWN') {
        maphandler.shutdown();
        parentPort.postMessage(undefined);
    }
});