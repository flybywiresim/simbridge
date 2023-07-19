import { GPU, IKernelRunShortcut, Texture } from 'gpu.js';
import { readFile } from 'fs/promises';
import {
    AircraftStatus,
    ElevationProfile,
    NavigationDisplay,
    PositionData,
    TerrainRenderingMode,
} from '../types';
import { TerrainMap } from '../fileformat/terrainmap';
import { Worldmap } from '../mapdata/worldmap';
import {
    GpuProcessingActive,
    NauticalMilesToMetres,
    InvalidElevation,
    UnknownElevation,
    WaterElevation,
    DefaultTileSize,
    NavigationDisplayMaxPixelWidth,
    NavigationDisplayMaxPixelHeight,
} from './generic/constants';
import { deg2rad, distanceWgs84, rad2deg } from './generic/helper';
import { createLocalElevationMap } from './gpu/elevationmap';
import { createElevationProfile } from './gpu/elevationprofile';
import { bearingWgs84, normalizeHeading, projectWgs84, wgs84toPixelCoordinate } from './gpu/helper';
import {
    ElevationProfileConstants,
    LocalElevationMapConstants,
} from './gpu/interfaces';
import { uploadTextureData } from './gpu/upload';
import { Logger } from './logging/logger';

export class MapHandler {
    private worldmap: Worldmap = null;

    private initialized = false;

    private currentGroundTruthPosition: PositionData = undefined;

    private uploadWorldMapToGPU: IKernelRunShortcut = null;

    private cachedElevationData: {
        gpuData: Texture,
        cpuData: Float32Array,
        cachedTiles: number,
    } = {
        gpuData: null,
        cpuData: null,
        cachedTiles: 0,
    }

    private worldMapMetadata: {
        southwest: { latitude: number, longitude: number },
        northeast: { latitude: number, longitude: number },
        currentGridPosition: { x: number, y: number },
        minWidthPerTile: number,
        minHeightPerTile: number,
        width: number,
        height: number,
    } = {
        southwest: { latitude: -100, longitude: -190 },
        northeast: { latitude: -100, longitude: -190 },
        currentGridPosition: { x: 0, y: 0 },
        minWidthPerTile: 0,
        minHeightPerTile: 0,
        width: 0,
        height: 0,
    };

    private extractElevationProfile: IKernelRunShortcut = null;

    private extractLocalElevationMap: IKernelRunShortcut = null;

    private aircraftStatus: AircraftStatus = null;

    private cleanupMemory(): void {
        this.worldmap.resetInternalData();
        if (this.cachedElevationData.gpuData !== null) {
            this.cachedElevationData.gpuData.delete();
            this.cachedElevationData.gpuData = null;
        }
        this.cachedElevationData.cachedTiles = 0;
        this.cachedElevationData.cpuData = null;

        this.worldMapMetadata = {
            southwest: { latitude: -100, longitude: -190 },
            northeast: { latitude: -100, longitude: -190 },
            currentGridPosition: { x: 0, y: 0 },
            minWidthPerTile: 0,
            minHeightPerTile: 0,
            width: 0,
            height: 0,
        };
        this.currentGroundTruthPosition = null;
        this.aircraftStatus = null;
    }

    public reset(): void {
        this.cleanupMemory();
    }

    public positionUpdate(data: PositionData): void {
        this.updateGroundTruthPositionAndCachedTiles(data, false);
    }

    public aircraftStatusUpdate(data: AircraftStatus): void {
        this.aircraftStatus = data;
    }

    private createKernels(): void {
        // register kernel to upload the map data
        this.uploadWorldMapToGPU = this.gpu
            .createKernel(uploadTextureData, {
                argumentTypes: { texture: 'Array', width: 'Integer' },
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: true,
                immutable: false,
                tactic: 'speed',
            });

        // register kernel to create the local map
        this.extractLocalElevationMap = this.gpu
            .createKernel(createLocalElevationMap, {
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: true,
                immutable: false,
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
                wgs84toPixelCoordinate,
            ]);

        this.extractElevationProfile = this.gpu
            .createKernel(createElevationProfile, {
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: true,
                immutable: false,
                tactic: 'speed',
            })
            .setConstants<ElevationProfileConstants>({
                unknownElevation: UnknownElevation,
                invalidElevation: InvalidElevation,
            })
            .setFunctions([
                deg2rad,
                rad2deg,
                bearingWgs84,
                distanceWgs84,
                projectWgs84,
                wgs84toPixelCoordinate,
            ]);
    }

    private async readTerrainMap(): Promise<TerrainMap | undefined> {
        try {
            const buffer = await readFile('./terrain/terrain.map');
            // const buffer = await fileService.getFile('terrain/', 'terrain.map');
            this.logging.info(`Read MB of terrainmap: ${(Buffer.byteLength(buffer) / (1024 * 1024)).toFixed(2)}`);
            return new TerrainMap(buffer);
        } catch (err) {
            this.logging.warn('Did not find the terrain.map-file');
            this.logging.warn(err);
            return undefined;
        }
    }

    constructor(private logging: Logger, private readonly gpu: GPU) { }

    public shutdown(): void {
        this.initialized = false;

        // destroy all generic GPU related instances
        if (this.cachedElevationData.gpuData !== null) this.cachedElevationData.gpuData.delete();
        if (this.extractLocalElevationMap !== null) this.extractLocalElevationMap.destroy();
        if (this.extractElevationProfile !== null) this.extractElevationProfile.destroy();
        if (this.uploadWorldMapToGPU !== null) this.uploadWorldMapToGPU.destroy();
    }

    public async initialize(): Promise<boolean> {
        return this.readTerrainMap().then((terrainmap) => {
            this.worldmap = new Worldmap(terrainmap);

            this.createKernels();

            // initial call precompile the kernels and reduce first reaction time
            const startupConfig: NavigationDisplay = {
                range: 10,
                arcMode: true,
                active: true,
                efisMode: 0,
                mapOffsetX: 0,
                mapWidth: NavigationDisplayMaxPixelWidth,
                mapHeight: NavigationDisplayMaxPixelHeight,
            };
            const startupStatus: AircraftStatus = {
                adiruDataValid: true,
                latitude: 47.26081085205078,
                longitude: 11.349658966064453,
                altitude: 1904,
                heading: 260,
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
                latitude: 47.26081085205078,
                longitude: 11.349658966064453,
            };
            // const startupProfile: ElevationProfile = {
            //     pathWidth: 4.0,
            //     waypointsLatitudes: [45.030668, 46.978744],
            //     waypointsLongitudes: [12.815273, 8.975899],
            //     range: 20.0,
            // };
            // this.navigationDisplayRendering.L.profile = startupProfile;
            // this.navigationDisplayRendering.R.profile = startupProfile;

            // run all process steps to precompile the kernels
            this.aircraftStatusUpdate(startupStatus);
            this.updateGroundTruthPositionAndCachedTiles(startupPosition, true);

            this.initialized = true;

            return true;
        });
    }

    private updateGroundTruthPositionAndCachedTiles(position: PositionData, startup: boolean): void {
        if (!this.initialized && !startup) return;

        this.currentGroundTruthPosition = position;
        const grid = this.worldmap.createGridLookupTable(position);
        const loadedTiles = this.worldmap.updatePosition(grid);
        const relevantTileCount = grid.length * grid[0].length;

        if (loadedTiles || this.cachedElevationData.cachedTiles !== relevantTileCount) {
            const [southwestLat, southwestLong] = projectWgs84(position.latitude, position.longitude, 225, this.worldmap.VisibilityRange * 1852);
            const southwestGrid = this.worldmap.worldMapIndices(southwestLat, southwestLong);
            const [northeastLat, northeastLong] = projectWgs84(position.latitude, position.longitude, 45, this.worldmap.VisibilityRange * 1852);
            const northeastGrid = this.worldmap.worldMapIndices(northeastLat, northeastLong);

            this.worldMapMetadata.minWidthPerTile = 5000;
            this.worldMapMetadata.minHeightPerTile = 5000;
            grid.forEach((row) => {
                row.forEach((cellIdx) => {
                    const cell = this.worldmap.TileManager.grid[cellIdx.row][cellIdx.column];
                    if (cell.tileIndex !== -1 && cell.elevationmap && cell.elevationmap.Rows !== 0 && cell.elevationmap.Columns !== 0) {
                        this.worldMapMetadata.minWidthPerTile = Math.min(cell.elevationmap.Columns, this.worldMapMetadata.minWidthPerTile);
                        this.worldMapMetadata.minHeightPerTile = Math.min(cell.elevationmap.Rows, this.worldMapMetadata.minHeightPerTile);
                    }
                });
            });

            if (this.worldMapMetadata.minWidthPerTile === 5000) this.worldMapMetadata.minWidthPerTile = DefaultTileSize;
            if (this.worldMapMetadata.minHeightPerTile === 5000) this.worldMapMetadata.minHeightPerTile = DefaultTileSize;

            const worldWidth = this.worldMapMetadata.minWidthPerTile * grid[0].length;
            const worldHeight = this.worldMapMetadata.minHeightPerTile * grid.length;
            this.cachedElevationData.cpuData = new Float32Array(worldWidth * worldHeight);
            let yOffset = 0;

            grid.forEach((row) => {
                for (let y = 0; y < this.worldMapMetadata.minHeightPerTile; y++) {
                    let xOffset = 0;

                    for (let x = 0; x < row.length; ++x) {
                        const cellIdx = row[x];
                        const cell = this.worldmap.TileManager.grid[cellIdx.row][cellIdx.column];
                        for (let x = 0; x < this.worldMapMetadata.minWidthPerTile; x++) {
                            const index = (y + yOffset) * worldWidth + xOffset + x;

                            if (cell.tileIndex === -1) {
                                this.cachedElevationData.cpuData[index] = WaterElevation;
                            } else if (cell.elevationmap.ElevationMap === undefined) {
                                this.cachedElevationData.cpuData[index] = UnknownElevation;
                            } else {
                                this.cachedElevationData.cpuData[index] = cell.elevationmap.ElevationMap[y * cell.elevationmap.Columns + x];
                            }
                        }

                        xOffset += this.worldMapMetadata.minWidthPerTile;
                    }
                }

                yOffset += this.worldMapMetadata.minHeightPerTile;
            });

            // update the world map metadata for the rendering
            this.worldMapMetadata.southwest.latitude = this.worldmap.TileManager.grid[southwestGrid.row][southwestGrid.column].southwest.latitude;
            this.worldMapMetadata.southwest.longitude = this.worldmap.TileManager.grid[southwestGrid.row][southwestGrid.column].southwest.longitude;
            this.worldMapMetadata.northeast.latitude = this.worldmap.TileManager.grid[northeastGrid.row][northeastGrid.column].southwest.latitude + this.worldmap.GridData.latitudeStep;
            this.worldMapMetadata.northeast.longitude = this.worldmap.TileManager.grid[northeastGrid.row][northeastGrid.column].southwest.longitude + this.worldmap.GridData.longitudeStep;
            this.worldMapMetadata.width = worldWidth;
            this.worldMapMetadata.height = worldHeight;

            this.uploadWorldMapToGPU = this.uploadWorldMapToGPU.setOutput([worldWidth, worldHeight]);
            this.cachedElevationData.gpuData = this.uploadWorldMapToGPU(this.cachedElevationData.cpuData, worldWidth) as Texture;
            // some GPU drivers require the flush call to release internal memory
            if (GpuProcessingActive) this.uploadWorldMapToGPU.context.flush();

            this.worldmap.TileManager.cleanupElevationCache(grid);
            this.cachedElevationData.cachedTiles = relevantTileCount;
        }

        // calculate the correct pixel coordinate in every step
        const southwest = this.worldmap.getSouthwestCoordinateOfTile(this.currentGroundTruthPosition.latitude, this.currentGroundTruthPosition.longitude);
        if (southwest !== undefined) {
            const latStep = this.worldmap.GridData.latitudeStep / this.worldMapMetadata.minHeightPerTile;
            const longStep = this.worldmap.GridData.longitudeStep / this.worldMapMetadata.minWidthPerTile;
            const latDelta = this.currentGroundTruthPosition.latitude - southwest.latitude;
            const longDelta = this.currentGroundTruthPosition.longitude - southwest.longitude;

            let yOffset = 0;
            let xOffset = 0;
            const egoIndex = this.worldmap.worldMapIndices(
                this.currentGroundTruthPosition.latitude,
                this.currentGroundTruthPosition.longitude,
            );
            grid.forEach((row, rowIdx) => {
                if (row[0].row === egoIndex.row) {
                    row.forEach((cell, columnIdx) => {
                        if (cell.column === egoIndex.column) {
                            yOffset = rowIdx * this.worldMapMetadata.minHeightPerTile;
                            xOffset = columnIdx * this.worldMapMetadata.minWidthPerTile;
                        }
                    });
                }
            });

            const globalEgoOffset: { x: number, y: number } = { x: xOffset + longDelta / longStep, y: yOffset + this.worldMapMetadata.minHeightPerTile - latDelta / latStep };
            this.worldMapMetadata.currentGridPosition = globalEgoOffset;
        } else {
            this.worldMapMetadata.currentGridPosition = { x: this.worldMapMetadata.width / 2, y: this.worldMapMetadata.height / 2 };
        }
    }

    public extractElevation(latitude: number, longitude: number): number {
        if (this.cachedElevationData.cpuData === null || this.cachedElevationData.cpuData.length === 0) {
            return InvalidElevation;
        }

        // calculate the pixel movement out of the current position
        const latStep = this.worldmap.GridData.latitudeStep / this.worldMapMetadata.minHeightPerTile;
        const longStep = this.worldmap.GridData.longitudeStep / this.worldMapMetadata.minWidthPerTile;
        const latPixelDelta = (this.aircraftStatus.latitude - latitude) / latStep;
        const longPixelDelta = (longitude - this.aircraftStatus.longitude) / longStep;

        // calculate the map index
        let index = (this.worldMapMetadata.currentGridPosition.y + latPixelDelta) * this.worldMapMetadata.width;
        index += this.worldMapMetadata.currentGridPosition.x + longPixelDelta;
        index = Math.floor(index);

        if (index >= this.cachedElevationData.cpuData.length) return UnknownElevation;

        return this.cachedElevationData.cpuData[index];
    }

    public createLocalElevationMap(config: NavigationDisplay): Texture {
        if (this.cachedElevationData.gpuData === null) return null;

        if (this.extractLocalElevationMap.output === null
            || this.extractLocalElevationMap.output[0] !== config.mapWidth
            || this.extractLocalElevationMap.output[1] !== config.mapHeight
        ) {
            this.extractLocalElevationMap = this.extractLocalElevationMap
                .setOutput([config.mapWidth, config.mapHeight]);
        }

        let metresPerPixel = Math.round((config.range * NauticalMilesToMetres) / config.mapHeight);
        if (config.arcMode) metresPerPixel *= 2.0;

        // create the local elevation map
        const localElevationMap = this.extractLocalElevationMap(
            this.aircraftStatus.latitude,
            this.aircraftStatus.longitude,
            this.aircraftStatus.heading,
            this.currentGroundTruthPosition.latitude,
            this.currentGroundTruthPosition.longitude,
            this.worldMapMetadata.currentGridPosition.x,
            this.worldMapMetadata.currentGridPosition.y,
            this.cachedElevationData.gpuData,
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

        // some GPU drivers require the flush call to release internal memory
        if (GpuProcessingActive) this.extractLocalElevationMap.context.flush();

        return localElevationMap;
    }

    public createElevationProfile(profile: ElevationProfile, profileWidth: number): Texture {
        if (this.cachedElevationData.gpuData === null) return null;

        if (this.extractElevationProfile.output === null
            || this.extractElevationProfile.output[0] !== profileWidth
        ) {
            this.extractElevationProfile = this.extractElevationProfile
                .setOutput([profileWidth]);
        }

        // create the local elevation map
        const elevationData = this.extractElevationProfile(
            this.aircraftStatus.latitude,
            this.aircraftStatus.longitude,
            this.currentGroundTruthPosition.latitude,
            this.currentGroundTruthPosition.longitude,
            this.worldMapMetadata.currentGridPosition.x,
            this.worldMapMetadata.currentGridPosition.y,
            this.cachedElevationData.gpuData,
            this.worldMapMetadata.width,
            this.worldMapMetadata.height,
            this.worldMapMetadata.southwest.latitude,
            this.worldMapMetadata.southwest.longitude,
            this.worldMapMetadata.northeast.latitude,
            this.worldMapMetadata.northeast.longitude,
            profile.pathWidth,
            profile.waypointsLatitudes,
            profile.waypointsLongitudes,
            profile.waypointsLatitudes.length,
            profile.range / profileWidth,
        ) as Texture;

        // some GPU drivers require the flush call to release internal memory
        if (GpuProcessingActive) this.extractElevationProfile.context.flush();

        return elevationData;
    }
}
