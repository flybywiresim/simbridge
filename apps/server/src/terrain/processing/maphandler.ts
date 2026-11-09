import { CPUKernel, GPU, IKernelRunShortcut, Texture } from 'gpu.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getExecutablePath } from '../../utilities/pathUtil';
import { AircraftStatus, ElevationProfile, EfisData, PositionData, TerrainRenderingMode } from '../types';
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
import { deg2rad, distanceWgs84, rad2deg, degreesPerPixel } from './generic/helper';
import { createLocalElevationMap } from './gpu/elevationmap';
import { createElevationProfile } from './gpu/elevationprofile';
import { bearingWgs84, normalizeHeading, projectWgs84, wgs84toPixelCoordinate } from './gpu/helper';
import { ElevationProfileConstants, LocalElevationMapConstants } from './gpu/interfaces';
import { decodeTerrainElevation } from './gpu/terrainsampling';
import { TerrainElevationData, TerrainTexture } from './gpu/terraintexture';
import { Logger } from './logging/logger';
import {
  containsTerrainBounds,
  extractTerrainDetail,
  reduceTerrain,
  terrainDetailBounds,
  TerrainDetailBounds,
  TerrainDetailMargin,
  TerrainDetailRange,
} from './terrainlod';

// defines the maximum dimension length of the world map
const GpuMaxPixelSize = 16384;

export class MapHandler {
  private worldmap: Worldmap = null;

  private initialized = false;

  private currentGroundTruthPosition: PositionData = undefined;

  private terrainTexture: TerrainTexture = null;

  private detailTexture: TerrainTexture = null;

  private detailData: TerrainElevationData = null;

  private detailBounds: TerrainDetailBounds = null;

  private cachedElevationData: {
    gpuData: TerrainElevationData;
    cpuData: Int16Array;
    gridKey: string;
  } = {
    gpuData: null,
    cpuData: null,
    gridKey: '',
  };

  private worldMapMetadata: {
    southwest: { latitude: number; longitude: number };
    northeast: { latitude: number; longitude: number };
    currentGridPosition: { x: number; y: number };
    minWidthPerTile: number;
    minHeightPerTile: number;
    width: number;
    height: number;
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
    this.terrainTexture?.reset();
    this.detailTexture?.reset();
    this.detailData = null;
    this.detailBounds = null;
    this.cachedElevationData.gpuData = null;
    this.cachedElevationData.gridKey = '';
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
    this.terrainTexture = new TerrainTexture(this.gpu);
    this.detailTexture = new TerrainTexture(this.gpu);

    // register kernel to create the local map
    this.extractLocalElevationMap = this.gpu
      .createKernel(createLocalElevationMap, {
        dynamicArguments: true,
        dynamicOutput: true,
        pipeline: true,
        immutable: false,
        precision: 'single',
        optimizeFloatMemory: true,
        tactic: 'speed',
      })
      .setConstants<LocalElevationMapConstants>({
        unknownElevation: UnknownElevation,
        invalidElevation: InvalidElevation,
        packedTerrain: this.gpu.Kernel !== CPUKernel,
      })
      .setFunctions([
        deg2rad,
        degreesPerPixel,
        normalizeHeading,
        rad2deg,
        projectWgs84,
        wgs84toPixelCoordinate,
        decodeTerrainElevation,
      ]);

    this.extractElevationProfile = this.gpu
      .createKernel(createElevationProfile, {
        dynamicArguments: true,
        dynamicOutput: true,
        pipeline: true,
        immutable: false,
        precision: 'single',
        optimizeFloatMemory: true,
        tactic: 'speed',
      })
      .setConstants<ElevationProfileConstants>({
        unknownElevation: UnknownElevation,
        invalidElevation: InvalidElevation,
        packedTerrain: this.gpu.Kernel !== CPUKernel,
      })
      .setFunctions([
        deg2rad,
        rad2deg,
        bearingWgs84,
        distanceWgs84,
        projectWgs84,
        wgs84toPixelCoordinate,
        decodeTerrainElevation,
      ]);
  }

  private async readTerrainMap(): Promise<TerrainMap | undefined> {
    try {
      // TODO shall we move this as well? Currently the installer downloads the terrain.map file
      const buffer = await readFile(join(getExecutablePath(), '/terrain/terrain.map'));
      this.logging.info(`Read MB of terrainmap: ${(Buffer.byteLength(buffer) / (1024 * 1024)).toFixed(2)}`);
      return new TerrainMap(buffer);
    } catch (err) {
      this.logging.warn('Did not find the terrain.map-file');
      this.logging.warn(err);
      return undefined;
    }
  }

  constructor(
    private logging: Logger,
    private readonly gpu: GPU,
  ) {}

  public shutdown(): void {
    this.initialized = false;

    // destroy all generic GPU related instances
    this.terrainTexture?.reset();
    this.detailTexture?.reset();
    this.detailData = null;
    this.detailBounds = null;
    this.cachedElevationData.gpuData = null;
    if (this.extractLocalElevationMap !== null) this.extractLocalElevationMap.destroy();
    if (this.extractElevationProfile !== null) this.extractElevationProfile.destroy();
  }

  public async initialize(): Promise<boolean> {
    return this.readTerrainMap().then((terrainmap) => {
      this.worldmap = new Worldmap(terrainmap);

      this.createKernels();

      // initial call precompile the kernels and reduce first reaction time
      const startupConfig: EfisData = {
        ndRange: 10,
        arcMode: true,
        terrOnNd: false,
        terrOnVd: false,
        efisMode: 0,
        vdRangeLower: -500,
        vdRangeUpper: 24000,
        mapOffsetX: 0,
        mapWidth: NavigationDisplayMaxPixelWidth,
        mapHeight: NavigationDisplayMaxPixelHeight,
        centerOffsetY: 0,
      };
      const startupStatus: AircraftStatus = {
        adiruDataValid: true,
        tawsInop: false,
        latitude: 47.26081085205078,
        longitude: 11.349658966064453,
        altitude: 1904,
        heading: 260,
        verticalSpeed: 0,
        gearIsDown: true,
        runwayDataValid: true,
        runwayLatitude: 47.26081085205078,
        runwayLongitude: 11.349658966064453,
        efisDataCapt: startupConfig,
        efisDataFO: startupConfig,
        navigationDisplayRenderingMode: TerrainRenderingMode.ArcMode,
        manualAzimEnabled: false,
        manualAzimDegrees: 0,
        groundTruthLatitude: 47.26081085205078,
        groundTruthLongitude: 11.349658966064453,
      };
      const startupPosition: PositionData = {
        latitude: 47.26081085205078,
        longitude: 11.349658966064453,
      };

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
    const lookup = this.worldmap.createGridLookupTable(position, GpuMaxPixelSize, GpuMaxPixelSize, DefaultTileSize);
    const tilesLoaded = this.worldmap.updatePosition(lookup.grid);
    // A shifted grid can contain the same number of tiles without loading new land.
    const gridKey = lookup.grid.map((row) => row.map((cell) => cell.row + ',' + cell.column).join(';')).join('|');

    if (tilesLoaded || this.cachedElevationData.gridKey !== gridKey) {
      const southwestGrid = this.worldmap.worldMapIndices(lookup.southwest.latitude, lookup.southwest.longitude);
      const northeastGrid = this.worldmap.worldMapIndices(lookup.northeast.latitude, lookup.northeast.longitude);

      this.worldMapMetadata.minWidthPerTile = lookup.minWidthPerTile;
      this.worldMapMetadata.minHeightPerTile = lookup.minHeightPerTile;

      const worldWidth = this.worldMapMetadata.minWidthPerTile * lookup.grid[0].length;
      const worldHeight = this.worldMapMetadata.minHeightPerTile * lookup.grid.length;
      this.cachedElevationData.cpuData = new Int16Array(worldWidth * worldHeight);
      let targetIndex = 0;

      lookup.grid.forEach((row) => {
        for (let y = 0; y < this.worldMapMetadata.minHeightPerTile; y++) {
          for (let gridX = 0; gridX < row.length; ++gridX) {
            const cellIdx = row[gridX];
            const cell = this.worldmap.TileManager.grid[cellIdx.row][cellIdx.column];

            // share subsampling error between all sides of the tile
            const tileOffset = [0, 0];
            if (cell.tileIndex !== -1 && cell.elevationmap.ElevationMap !== undefined) {
              if (cell.elevationmap.Rows > this.worldMapMetadata.minHeightPerTile) {
                const rowDelta = cell.elevationmap.Rows - this.worldMapMetadata.minHeightPerTile;
                tileOffset[1] = Math.ceil(rowDelta / 2);
              }

              if (cell.elevationmap.Columns > this.worldMapMetadata.minWidthPerTile) {
                const columnDelta = cell.elevationmap.Columns - this.worldMapMetadata.minWidthPerTile;
                tileOffset[0] = Math.ceil(columnDelta / 2);
              }
            }

            for (let x = 0; x < this.worldMapMetadata.minWidthPerTile; x++) {
              if (cell.tileIndex === -1) {
                this.cachedElevationData.cpuData[targetIndex] = WaterElevation;
              } else if (cell.elevationmap.ElevationMap === undefined) {
                this.cachedElevationData.cpuData[targetIndex] = UnknownElevation;
              } else {
                this.cachedElevationData.cpuData[targetIndex] =
                  cell.elevationmap.ElevationMap[(y + tileOffset[1]) * cell.elevationmap.Columns + x + tileOffset[0]];
              }

              targetIndex += 1;
            }
          }
        }
      });

      // update the world map metadata for the rendering
      this.worldMapMetadata.southwest.latitude =
        this.worldmap.TileManager.grid[southwestGrid.row][southwestGrid.column].southwest.latitude;
      this.worldMapMetadata.southwest.longitude =
        this.worldmap.TileManager.grid[southwestGrid.row][southwestGrid.column].southwest.longitude;
      this.worldMapMetadata.northeast.latitude =
        this.worldmap.TileManager.grid[northeastGrid.row][northeastGrid.column].southwest.latitude +
        this.worldmap.GridData.latitudeStep;
      this.worldMapMetadata.northeast.longitude =
        this.worldmap.TileManager.grid[northeastGrid.row][northeastGrid.column].southwest.longitude +
        this.worldmap.GridData.longitudeStep;
      this.worldMapMetadata.width = worldWidth;
      this.worldMapMetadata.height = worldHeight;

      this.cachedElevationData.gpuData = this.terrainTexture.upload(
        reduceTerrain(this.cachedElevationData.cpuData, worldWidth, worldHeight),
        Math.ceil(worldWidth / 2),
        Math.ceil(worldHeight / 2),
      );
      // some GPU drivers require the flush call to release internal memory
      if (GpuProcessingActive) this.gpu.context.flush();

      this.worldmap.TileManager.cleanupElevationCache(lookup.grid);
      this.cachedElevationData.gridKey = gridKey;
      this.detailBounds = null;
    }

    // calculate the correct pixel coordinate in every step
    const southwest = this.worldmap.getSouthwestCoordinateOfTile(
      this.currentGroundTruthPosition.latitude,
      this.currentGroundTruthPosition.longitude,
    );
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
      lookup.grid.forEach((row, rowIdx) => {
        if (row[0].row === egoIndex.row) {
          row.forEach((cell, columnIdx) => {
            if (cell.column === egoIndex.column) {
              yOffset = rowIdx * this.worldMapMetadata.minHeightPerTile;
              xOffset = columnIdx * this.worldMapMetadata.minWidthPerTile;
            }
          });
        }
      });

      const globalEgoOffset: { x: number; y: number } = {
        x: xOffset + longDelta / longStep,
        y: yOffset + this.worldMapMetadata.minHeightPerTile - latDelta / latStep,
      };
      this.worldMapMetadata.currentGridPosition = globalEgoOffset;
    } else {
      this.worldMapMetadata.currentGridPosition = {
        x: this.worldMapMetadata.width / 2,
        y: this.worldMapMetadata.height / 2,
      };
    }
    this.updateDetailMap();
  }

  private updateDetailMap(): void {
    if (!this.cachedElevationData.cpuData) return;
    const metadata = this.worldMapMetadata;
    const boundsForRange = (range: number) =>
      terrainDetailBounds(
        this.currentGroundTruthPosition.latitude,
        metadata.currentGridPosition.x,
        metadata.currentGridPosition.y,
        metadata.width,
        metadata.height,
        this.worldmap.GridData.latitudeStep / metadata.minHeightPerTile,
        this.worldmap.GridData.longitudeStep / metadata.minWidthPerTile,
        range,
      );
    if (containsTerrainBounds(this.detailBounds, boundsForRange(TerrainDetailRange))) return;
    const bounds = boundsForRange(TerrainDetailRange + TerrainDetailMargin);
    const data = extractTerrainDetail(this.cachedElevationData.cpuData, metadata.width, bounds);
    this.detailData = this.detailTexture.upload(data, bounds[2], bounds[3]);
    this.detailBounds = bounds;
    if (GpuProcessingActive) this.gpu.context.flush();
  }

  public extractElevation(latitude: number, longitude: number): number {
    if (this.cachedElevationData.cpuData === null || this.cachedElevationData.cpuData.length === 0) {
      return InvalidElevation;
    }

    // calculate the pixel movement out of the current position
    const step = degreesPerPixel(
      this.worldMapMetadata.southwest.latitude,
      this.worldMapMetadata.southwest.longitude,
      this.worldMapMetadata.northeast.latitude,
      this.worldMapMetadata.northeast.longitude,
      this.aircraftStatus.latitude,
      this.worldMapMetadata.width,
      this.worldMapMetadata.height,
    );
    const latPixelDelta = (this.currentGroundTruthPosition.latitude - latitude) / step[0];
    const longPixelDelta = (longitude - this.currentGroundTruthPosition.longitude) / step[1];

    // calculate the map index
    let index = (this.worldMapMetadata.currentGridPosition.y + latPixelDelta) * this.worldMapMetadata.width;
    index += this.worldMapMetadata.currentGridPosition.x + longPixelDelta;
    index = Math.floor(index);

    if (index >= this.cachedElevationData.cpuData.length) return UnknownElevation;

    return this.cachedElevationData.cpuData[index];
  }

  public createLocalElevationMap(config: EfisData): Texture {
    if (this.cachedElevationData.gpuData === null || this.aircraftStatus === null) return null;

    if (
      this.extractLocalElevationMap.output === null ||
      this.extractLocalElevationMap.output[0] !== config.mapWidth ||
      this.extractLocalElevationMap.output[1] !== config.mapHeight
    ) {
      this.extractLocalElevationMap = this.extractLocalElevationMap.setOutput([config.mapWidth, config.mapHeight]);
    }

    let metresPerPixel = Math.round(
      (config.ndRange * NauticalMilesToMetres) / (config.mapHeight - config.centerOffsetY),
    );
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
      config.centerOffsetY,
      this.detailData,
      this.detailBounds,
    ) as Texture;

    // some GPU drivers require the flush call to release internal memory
    if (GpuProcessingActive) this.extractLocalElevationMap.context.flush();

    return localElevationMap;
  }

  public createElevationProfile(profile: ElevationProfile, profileWidth: number): Texture {
    if (this.cachedElevationData.gpuData === null) return null;
    if (profile.waypointsLatitudes === undefined || profile.waypointsLongitudes === undefined) return null;
    if (
      profile.waypointsLatitudes.length === 0 ||
      profile.waypointsLatitudes.length !== profile.waypointsLongitudes.length
    )
      return null;

    if (this.extractElevationProfile.output === null || this.extractElevationProfile.output[0] !== profileWidth) {
      this.extractElevationProfile = this.extractElevationProfile.setOutput([profileWidth]);
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
      this.detailData,
      this.detailBounds,
    ) as Texture;

    // some GPU drivers require the flush call to release internal memory
    if (GpuProcessingActive) this.extractElevationProfile.context.flush();

    return elevationData;
  }
}
