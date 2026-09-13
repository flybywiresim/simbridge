import { GPU, IKernelRunShortcut, Texture } from 'gpu.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getExecutablePath } from 'apps/server/src/utilities/pathUtil';
import { AircraftStatus, ElevationProfile, EfisData, PositionData, TerrainRenderingMode } from '../types';
import { TerrainMap } from '../fileformat/terrainmap';
import { TileSource } from '../fileformat/tilesource';
import { Worldmap } from '../mapdata/worldmap';
import {
  GpuProcessingActive,
  NauticalMilesToMetres,
  InvalidElevation,
  UnknownElevation,
  WaterElevation,
  DefaultTileSize,
  NavigationDisplayMaxPixelWidth,
  TerrainDiagnosticsEnabled,
  NavigationDisplayMaxPixelHeight,
} from './generic/constants';
import { deg2rad, distanceWgs84, rad2deg, degreesPerPixel } from './generic/helper';
import { memorySnapshot } from './generic/memory';
import { createLocalElevationMap } from './gpu/elevationmap';
import { createElevationProfile } from './gpu/elevationprofile';
import { bearingWgs84, normalizeHeading, projectWgs84, wgs84toPixelCoordinate } from './gpu/helper';
import { ElevationProfileConstants, LocalElevationMapConstants } from './gpu/interfaces';
import { uploadTextureData } from './gpu/upload';
import { Logger } from './logging/logger';

// 4096 covers ~40nm ND range with typical tile density, ~64MB Float32
const GpuMaxPixelSize = 4096;

// extract data from GPU.js objects â€” in CPU mode these may be Arrays or Textures
const extractData = (obj: any): any => {
  if (Array.isArray(obj)) return obj;
  if (typeof obj?.toArray === 'function') return obj.toArray();
  if (obj?.data) return obj.data;
  return obj;
};

export class MapHandler {
  private worldmap: Worldmap = null;

  private initialized = false;

  private currentGroundTruthPosition: PositionData = undefined;

  private uploadWorldMapToGPU: IKernelRunShortcut = null;

  private cachedElevationData: {
    gpuData: Texture;
    cpuData: Float32Array;
    cachedTiles: number;
  } = {
    gpuData: null,
    cpuData: null,
    cachedTiles: 0,
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

  private cachedTerrainMap: TerrainMap | undefined = undefined;

  private tileSource: TileSource | null = null;

  /*
   * gpuData is NOT ours to delete.
   *
   * uploadWorldMapToGPU is created with immutable:false, and gpu.js returns the kernel's
   * own output texture in that mode (gl/kernel.js renderTexture():
   * `return this.immutable ? this.texture.clone() : this.texture`). Calling delete() on it
   * runs gl.deleteTexture on the kernel's live output texture and marks the wrapper
   * _deleted. The kernel never rebuilds it — _setupOutputTexture() early-returns while
   * kernel.texture is still set — so every subsequent run draws into a destroyed texture
   * and the world map reads back as zeros.
   *
   * Symptom that got us here: the first ND cycle renders correctly, then min/max elevation
   * collapse to 0/100ft for good, the flat-earth branch drops lowDensityGreen to 0 and the
   * whole display goes green. Dropping the reference is all that is needed; the texture is
   * reused across runs and is released by the kernel's own destroy().
   */
  private cleanupMemory(): void {
    if (this.worldmap !== null) this.worldmap.resetInternalData();
    this.cachedElevationData.gpuData = null;
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
    this.pendingRebuildPosition = null;
    this.aircraftStatus = null;
  }

  public reset(): void {
    this.cleanupMemory();
  }

  // null worldmap â†’ TileManager â†’ Tiles â†’ compressedData â†’ original 231MB buffer all GC'd
  // GPU kernels kept alive â€” recompilation is expensive, reuse on re-enable
  public unload(): void {
    if (this.worldmap !== null) {
      this.worldmap.clearTerrainData();
      this.worldmap = null;
    }
    // every Tile.CompressedData is a subarray view on the 231MB terrain.map buffer,
    // so holding the parsed map here pins the whole file for the process lifetime
    this.cachedTerrainMap = undefined;
    this.closeTileSource();
    this.cleanupMemory();
    this.initialized = false;
    this.logging.info('Terrain data unloaded');
  }

  // reduces world map size when pilot selects shorter range (10/20/40nm)
  public setVisibilityRange(rangeNm: number): void {
    // add 20% margin so terrain is visible at edges of ND display
    const newRange = Math.max(50, Math.min(rangeNm * 1.2, 400));
    if (this.worldmap && Math.abs(this.worldmap.VisibilityRange - newRange) > 5) {
      this.worldmap.VisibilityRange = newRange;
      // force world map rebuild on next position update
      this.cachedElevationData.cachedTiles = 0;

      if (this.worldmap.TileManager && this.currentGroundTruthPosition) {
        const lookup = this.worldmap.createGridLookupTable(
          this.currentGroundTruthPosition,
          GpuMaxPixelSize,
          GpuMaxPixelSize,
          DefaultTileSize,
        );
        this.worldmap.TileManager.cleanupElevationCache(lookup.grid);
        // cachedTiles=0 above already forces a full cpuData rebuild on the next position
        // update, which reallocates if the size changed. Deliberately leave the current
        // buffer in place until then: extractElevation() reads it for the runway cut-off
        // altitude, and handing it null degrades that to HistogramMinimumElevation.
      }

      // Rebuild now rather than waiting for the next SimConnect position update. The
      // render cycle restarts immediately on a range change, so without this the first
      // sweep after 20nm -> 320nm draws from the previous, smaller world map: a square
      // of valid terrain surrounded by UnknownElevation, with the rest only appearing
      // once a position update happens to arrive.
      if (this.currentGroundTruthPosition !== null && this.currentGroundTruthPosition !== undefined) {
        this.updateGroundTruthPositionAndCachedTiles(this.currentGroundTruthPosition, false).catch((err) =>
          this.logging.error(`World map rebuild after range change failed: ${err.message}`),
        );
      }
    }
  }

  public async positionUpdate(data: PositionData): Promise<void> {
    if (!this.initialized || !this.worldmap) return;
    await this.updateGroundTruthPositionAndCachedTiles(data, false);
  }

  public aircraftStatusUpdate(data: AircraftStatus): void {
    this.aircraftStatus = data;
  }

  private createKernels(): void {
    if (this.uploadWorldMapToGPU !== null) {
      this.uploadWorldMapToGPU.destroy();
      this.uploadWorldMapToGPU = null;
    }
    if (this.extractLocalElevationMap !== null) {
      this.extractLocalElevationMap.destroy();
      this.extractLocalElevationMap = null;
    }
    if (this.extractElevationProfile !== null) {
      this.extractElevationProfile.destroy();
      this.extractElevationProfile = null;
    }

    // register kernel to upload the map data
    this.uploadWorldMapToGPU = this.gpu.createKernel(uploadTextureData, {
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
      .setFunctions([deg2rad, degreesPerPixel, normalizeHeading, rad2deg, projectWgs84, wgs84toPixelCoordinate]);

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
      .setFunctions([deg2rad, rad2deg, bearingWgs84, distanceWgs84, projectWgs84, wgs84toPixelCoordinate]);
  }

  // Elevations reach 32767 (InvalidElevation). If gpu.js falls back to 'unsigned'
  // precision the world map texture is 8 bit per channel and every elevation is
  // destroyed on upload — terrain still renders, but every colour threshold is wrong.
  // Logged once at info level because it is the first thing to check when the ND
  // colours look incorrect, and it depends on the driver, not on this code.
  private logMemory(label: string): void {
    if (!TerrainDiagnosticsEnabled) return;
    this.logging.info(`Terrain memory [${label}]: ${memorySnapshot()}`);
  }

  private logGpuCapabilities(): void {
    try {
      // the run shortcut only exposes .kernel after a kernel switch, so fall back to
      // the GPU-wide capability, which is what gpu.js uses to choose the precision
      const precision =
        (this.uploadWorldMapToGPU as any)?.kernel?.precision ??
        (GPU.isSinglePrecisionSupported ? 'single (inferred)' : 'unsigned (inferred)');
      if (TerrainDiagnosticsEnabled) {
        this.logging.info(
          `GPU: mode=${(this.gpu as any).mode} singlePrecisionSupported=${GPU.isSinglePrecisionSupported} ` +
            `worldMapPrecision=${precision} GpuProcessingActive=${GpuProcessingActive}`,
        );
      }
      if (GpuProcessingActive && !GPU.isSinglePrecisionSupported) {
        this.logging.error(
          'GPU reports no float texture support — elevation data will be quantised to 8 bit ' +
            'and ND terrain colours will be wrong. Check the GL adapter being selected.',
        );
      }
    } catch (err) {
      this.logging.warn(`Could not read GPU capabilities: ${err.message}`);
    }
  }

  private async readTerrainMap(): Promise<TerrainMap | undefined> {
    if (this.cachedTerrainMap !== undefined) {
      this.logging.debug('Reusing cached terrain.map');
      return this.cachedTerrainMap;
    }
    try {
      const path = join(getExecutablePath(), '/terrain/terrain.map');
      const buffer = await readFile(path);
      this.logging.debug(`Read MB of terrainmap: ${(Buffer.byteLength(buffer) / (1024 * 1024)).toFixed(2)}`);
      const terrainmap = new TerrainMap(buffer);

      // Headers are all we keep. Each Tile.CompressedData is a view over the 231MB buffer
      // above, so holding them would pin the whole file; drop the views and let TileSource
      // read payloads back per tile. The buffer goes out of scope here and is collected.
      this.tileSource = new TileSource(path);
      await this.tileSource.openFile();
      terrainmap.releaseCompressedData();

      this.cachedTerrainMap = terrainmap;
      return this.cachedTerrainMap;
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

  private closeTileSource(): void {
    const source = this.tileSource;
    this.tileSource = null;
    if (source !== null) {
      source.close().catch((err) => this.logging.warn(`Closing terrain.map failed: ${err.message}`));
    }
  }

  public shutdown(): void {
    this.initialized = false;
    this.cachedTerrainMap = undefined;
    this.closeTileSource();

    // destroy all generic GPU related instances. gpuData is the upload kernel's own
    // output texture (see cleanupMemory) — destroying the kernel releases it.
    this.cachedElevationData.gpuData = null;
    if (this.extractLocalElevationMap !== null) this.extractLocalElevationMap.destroy();
    if (this.extractElevationProfile !== null) this.extractElevationProfile.destroy();
    if (this.uploadWorldMapToGPU !== null) this.uploadWorldMapToGPU.destroy();
  }

  public async initialize(): Promise<boolean> {
    try {
      // bracket each init step: the terrain worker settles at ~1GB of V8 old_space and
      // these four lines say which step puts it there — file parse, world grid, kernel
      // compilation or the precompile pass
      this.logMemory('init:start');

      const terrainmap = await this.readTerrainMap();
      this.logMemory(
        `init:terrain.map parsed tiles=${terrainmap?.Tiles.length ?? 0} ` +
          `angularSteps=${terrainmap?.AngularSteps.latitude}x${terrainmap?.AngularSteps.longitude}`,
      );

      this.logging.debug('Creating Worldmap...');
      this.worldmap = new Worldmap(terrainmap, this.tileSource);
      this.logMemory(`init:worldmap grid=${this.worldmap.GridData.rows}x${this.worldmap.GridData.columns}`);

      this.logging.debug('Creating GPU kernels...');
      this.createKernels();
      this.logGpuCapabilities();
      this.logMemory('init:kernels');

      this.logging.debug('Precompiling kernels...');

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
      this.logging.debug('Precompiling: aircraftStatusUpdate...');
      this.aircraftStatusUpdate(startupStatus);
      this.logging.debug('Precompiling: updateGroundTruth...');
      await this.updateGroundTruthPositionAndCachedTiles(startupPosition, true);
      this.logging.debug('Precompiling done');
      this.logMemory('init:precompiled');

      this.initialized = true;

      this.logging.info('Map handler initialized');
      return true;
    } catch (err) {
      this.logging.error(`Map handler init failed: ${err.message}\n${err.stack}`);
      return false;
    }
  }

  private worldMapRebuildInFlight = false;

  private pendingRebuildPosition: PositionData | null = null;

  private lastCoverageReport = 0;

  private async updateGroundTruthPositionAndCachedTiles(position: PositionData, startup: boolean): Promise<void> {
    if (!this.initialized && !startup) return;
    const worldmap = this.worldmap;
    if (!worldmap) return;

    /*
     * A rebuild awaits tile decompression partway through and then writes cpuData, which
     * is reused across rebuilds — two overlapping runs would interleave writes into the
     * same buffer. So only one runs at a time.
     *
     * Coalesce rather than drop. Stepping 80 -> 160 -> 320nm fires setVisibilityRange
     * three times in a row; simply returning while busy meant the 320nm rebuild was
     * discarded and the map stayed at whatever range happened to win the race until the
     * next position update arrived. That is the square of terrain surrounded by black.
     * Superseding the pending position is correct: only the newest one matters.
     */
    this.pendingRebuildPosition = position;
    if (this.worldMapRebuildInFlight) return;

    this.worldMapRebuildInFlight = true;
    try {
      while (this.pendingRebuildPosition !== null) {
        const next = this.pendingRebuildPosition;
        this.pendingRebuildPosition = null;
        if (!this.worldmap) break;
        await this.rebuildWorldMap(this.worldmap, next);
      }
    } finally {
      this.worldMapRebuildInFlight = false;
    }
  }

  private async rebuildWorldMap(worldmap: Worldmap, position: PositionData): Promise<void> {
    const t0 = Date.now();
    // read at build time: VisibilityRange can change again while this rebuild awaits
    const visibilityAtBuild = worldmap.VisibilityRange;
    this.currentGroundTruthPosition = position;
    const lookup = worldmap.createGridLookupTable(position, GpuMaxPixelSize, GpuMaxPixelSize, DefaultTileSize);
    const t1 = Date.now();
    const tilesLoaded = await worldmap.updatePosition(lookup.grid);
    const t2 = Date.now();

    // worldmap may have been nulled by unload() during the await above
    if (!this.worldmap) return;

    const relevantTileCount = lookup.grid.length * lookup.grid[0].length;

    if (tilesLoaded || this.cachedElevationData.cachedTiles !== relevantTileCount) {
      const southwestGrid = worldmap.worldMapIndices(lookup.southwest.latitude, lookup.southwest.longitude);
      const northeastGrid = worldmap.worldMapIndices(lookup.northeast.latitude, lookup.northeast.longitude);

      this.worldMapMetadata.minWidthPerTile = lookup.minWidthPerTile;
      this.worldMapMetadata.minHeightPerTile = lookup.minHeightPerTile;

      const worldWidth = this.worldMapMetadata.minWidthPerTile * lookup.grid[0].length;
      const worldHeight = this.worldMapMetadata.minHeightPerTile * lookup.grid.length;
      // reuse the buffer when the world size is unchanged — this runs on every
      // position update and a 4096x4096 Float32Array is 67MB of garbage per call
      const requiredLength = worldWidth * worldHeight;
      if (this.cachedElevationData.cpuData === null || this.cachedElevationData.cpuData.length !== requiredLength) {
        this.cachedElevationData.cpuData = new Float32Array(requiredLength);
      }
      let targetIndex = 0;

      lookup.grid.forEach((row) => {
        for (let y = 0; y < this.worldMapMetadata.minHeightPerTile; y++) {
          for (let gridX = 0; gridX < row.length; ++gridX) {
            const cellIdx = row[gridX];
            const cell = worldmap.TileManager.grid[cellIdx.row][cellIdx.column];

            // share subsampling error between all sides of the tile
            const tileOffset = [0, 0];
            if (cell.tileIndex !== -1 && cell.elevationmap && cell.elevationmap.ElevationMap !== undefined) {
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
              } else if (!cell.elevationmap || cell.elevationmap.ElevationMap === undefined) {
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

      const t3 = Date.now();
      // update the world map metadata for the rendering
      this.worldMapMetadata.southwest.latitude =
        worldmap.TileManager.grid[southwestGrid.row][southwestGrid.column].southwest.latitude;
      this.worldMapMetadata.southwest.longitude =
        worldmap.TileManager.grid[southwestGrid.row][southwestGrid.column].southwest.longitude;
      this.worldMapMetadata.northeast.latitude =
        worldmap.TileManager.grid[northeastGrid.row][northeastGrid.column].southwest.latitude +
        worldmap.GridData.latitudeStep;
      this.worldMapMetadata.northeast.longitude =
        worldmap.TileManager.grid[northeastGrid.row][northeastGrid.column].southwest.longitude +
        worldmap.GridData.longitudeStep;
      this.worldMapMetadata.width = worldWidth;
      this.worldMapMetadata.height = worldHeight;

      // gpu.js setOutput() on a built kernel recreates the output texture and pushes
      // the new handle into kernel.textureCache, which is only drained by destroy() —
      // so only resize when the dimensions actually changed
      const currentOutput = this.uploadWorldMapToGPU.output;
      if (currentOutput === null || currentOutput[0] !== worldWidth || currentOutput[1] !== worldHeight) {
        this.uploadWorldMapToGPU = this.uploadWorldMapToGPU.setOutput([worldWidth, worldHeight]);
      }
      // no delete() here — see cleanupMemory(). The kernel owns this texture and
      // reuses it every run; deleting it kills the world map after the first cycle.
      this.cachedElevationData.gpuData = this.uploadWorldMapToGPU(
        this.cachedElevationData.cpuData,
        worldWidth,
      ) as Texture;
      // some GPU drivers require the flush call to release internal memory
      if (GpuProcessingActive && this.uploadWorldMapToGPU.context) this.uploadWorldMapToGPU.context.flush();
      const t4 = Date.now();

      worldmap.TileManager.cleanupElevationCache(lookup.grid);
      this.cachedElevationData.cachedTiles = relevantTileCount;

      // Coverage is what decides whether the ND can draw the selected range at all: the
      // grid is clipped to GpuMaxPixelSize, so at long ranges the map can be narrower
      // than the display asks for and everything beyond it renders as UnknownElevation.
      if (TerrainDiagnosticsEnabled && Date.now() - this.lastCoverageReport > 10_000) {
        this.lastCoverageReport = Date.now();
        const latSpanNm = (lookup.northeast.latitude - lookup.southwest.latitude) * 60;
        this.logging.info(
          `World map: ${worldWidth}x${worldHeight}px tiles=${relevantTileCount} ` +
            `tileSize=${lookup.minWidthPerTile}x${lookup.minHeightPerTile} ` +
            `builtFor=${Math.round(visibilityAtBuild)}nm now=${Math.round(worldmap.VisibilityRange)}nm ` +
            `coverage=~${Math.round(latSpanNm / 2)}nm radius ` +
            `(clip=${GpuMaxPixelSize}px) rebuild=${Date.now() - t0}ms`,
        );
      }
      this.logging.debug(
        `updateGroundTruth: grid=${t1.toFixed(0)}ms tiles=${(t2 - t1).toFixed(0)}ms rebuild=${(t3 - t2).toFixed(0)}ms upload=${(t4 - t3).toFixed(0)}ms total=${(t4 - t0).toFixed(0)}ms tiles=${relevantTileCount} worldSize=${worldWidth}x${worldHeight}`,
      );
    }

    // calculate the correct pixel coordinate in every step
    const southwest = worldmap.getSouthwestCoordinateOfTile(
      this.currentGroundTruthPosition.latitude,
      this.currentGroundTruthPosition.longitude,
    );
    if (southwest !== undefined) {
      const latStep = worldmap.GridData.latitudeStep / this.worldMapMetadata.minHeightPerTile;
      const longStep = worldmap.GridData.longitudeStep / this.worldMapMetadata.minWidthPerTile;
      const latDelta = this.currentGroundTruthPosition.latitude - southwest.latitude;
      const longDelta = this.currentGroundTruthPosition.longitude - southwest.longitude;

      let yOffset = 0;
      let xOffset = 0;
      const egoIndex = worldmap.worldMapIndices(
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

  public createLocalElevationMap(config: EfisData): Texture | number[][] {
    if (this.cachedElevationData.gpuData === null || this.aircraftStatus === null) return null;

    if (!GpuProcessingActive) {
      return this.createLocalElevationMapCPU(config);
    }

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
    ) as Texture;

    // some GPU drivers require the flush call to release internal memory
    if (GpuProcessingActive && this.extractLocalElevationMap.context) this.extractLocalElevationMap.context.flush();

    return localElevationMap;
  }

  private createLocalElevationMapCPU(config: EfisData): number[][] {
    const latitude = this.aircraftStatus.latitude;
    const longitude = this.aircraftStatus.longitude;
    const heading = this.aircraftStatus.heading;
    const groundTruthLatitude = this.currentGroundTruthPosition.latitude;
    const groundTruthLongitude = this.currentGroundTruthPosition.longitude;
    const currentWorldGridX = this.worldMapMetadata.currentGridPosition.x;
    const currentWorldGridY = this.worldMapMetadata.currentGridPosition.y;
    const worldMap = extractData(this.cachedElevationData.gpuData) as number[][];
    const worldMapWidth = this.worldMapMetadata.width;
    const worldMapHeight = this.worldMapMetadata.height;
    const worldMapSouthwestLat = this.worldMapMetadata.southwest.latitude;
    const worldMapSouthwestLong = this.worldMapMetadata.southwest.longitude;
    const worldMapNortheastLat = this.worldMapMetadata.northeast.latitude;
    const worldMapNortheastLong = this.worldMapMetadata.northeast.longitude;
    const ndWidth = config.mapWidth;
    const ndHeight = config.mapHeight;

    let metresPerPixel = Math.round((config.ndRange * NauticalMilesToMetres) / (ndHeight - config.centerOffsetY));
    if (config.arcMode) metresPerPixel *= 2.0;

    const centerX = ndWidth / 2.0;
    const meterPerPixelHalf = metresPerPixel / 2.0;
    const output: number[][] = new Array(ndHeight);

    for (let ty = 0; ty < ndHeight; ty++) {
      const row = new Array(ndWidth);
      const deltaY = ndHeight - ty - config.centerOffsetY;

      for (let tx = 0; tx < ndWidth; tx++) {
        const deltaX = tx - centerX;

        if (tx >= ndWidth || ty >= ndHeight) {
          row[tx] = InvalidElevation;
          continue;
        }

        const distancePixels = Math.sqrt(deltaX ** 2 + deltaY ** 2);
        if (config.centerOffsetY === 0 && config.arcMode && distancePixels > ndHeight) {
          row[tx] = InvalidElevation;
          continue;
        }

        const distance = distancePixels * meterPerPixelHalf;
        const angle = rad2deg(Math.acos(deltaY / distancePixels));
        const bearing = normalizeHeading((tx > centerX ? angle : 360.0 - angle) + heading);

        const projected = projectWgs84(latitude, longitude, bearing, distance);
        const pixel = wgs84toPixelCoordinate(
          latitude,
          projected[0],
          projected[1],
          groundTruthLatitude,
          groundTruthLongitude,
          worldMapSouthwestLat,
          worldMapSouthwestLong,
          worldMapNortheastLat,
          worldMapNortheastLong,
          worldMapWidth,
          worldMapHeight,
          currentWorldGridX,
          currentWorldGridY,
        );

        if (pixel[1] < 0 || pixel[1] >= worldMapHeight || pixel[0] < 0 || pixel[0] >= worldMapWidth) {
          row[tx] = UnknownElevation;
          continue;
        }

        row[tx] = worldMap[pixel[1]][pixel[0]];
      }
      output[ty] = row;
    }
    return output;
  }

  public createElevationProfile(profile: ElevationProfile, profileWidth: number): Texture | number[] {
    if (this.cachedElevationData.gpuData === null) return null;
    if (profile.waypointsLatitudes === undefined || profile.waypointsLongitudes === undefined) return null;
    if (
      profile.waypointsLatitudes.length === 0 ||
      profile.waypointsLatitudes.length !== profile.waypointsLongitudes.length
    )
      return null;

    if (!GpuProcessingActive) {
      return this.createElevationProfileCPU(profile, profileWidth);
    }

    if (this.extractElevationProfile.output === null || this.extractElevationProfile.output[0] !== profileWidth) {
      this.extractElevationProfile = this.extractElevationProfile.setOutput([profileWidth]);
    }

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
    if (GpuProcessingActive && this.extractElevationProfile.context) this.extractElevationProfile.context.flush();

    return elevationData;
  }

  private createElevationProfileCPU(profile: ElevationProfile, profileWidth: number): number[] {
    const latitude = this.aircraftStatus.latitude;
    const longitude = this.aircraftStatus.longitude;
    const groundTruthLatitude = this.currentGroundTruthPosition.latitude;
    const groundTruthLongitude = this.currentGroundTruthPosition.longitude;
    const currentWorldGridX = this.worldMapMetadata.currentGridPosition.x;
    const currentWorldGridY = this.worldMapMetadata.currentGridPosition.y;
    const worldMap = extractData(this.cachedElevationData.gpuData) as number[][];
    const worldMapWidth = this.worldMapMetadata.width;
    const worldMapHeight = this.worldMapMetadata.height;
    const worldMapSouthwestLat = this.worldMapMetadata.southwest.latitude;
    const worldMapSouthwestLong = this.worldMapMetadata.southwest.longitude;
    const worldMapNortheastLat = this.worldMapMetadata.northeast.latitude;
    const worldMapNortheastLong = this.worldMapMetadata.northeast.longitude;

    const distancePerPixel = profile.range / profileWidth;
    const waypointsLatitudes = profile.waypointsLatitudes;
    const waypointsLongitudes = profile.waypointsLongitudes;
    const waypointsPointCount = waypointsLatitudes.length;
    const pathOffset = profile.pathWidth;

    const output = new Array(profileWidth);

    for (let threadX = 0; threadX < profileWidth; threadX++) {
      const distanceForPixel = distancePerPixel * threadX;
      let routeSegmentIndex = waypointsPointCount;
      let routeStartPointDistance = 0.0;
      let startLatitude = latitude;
      let startLongitude = longitude;

      for (let i = 0; i < waypointsPointCount; i++) {
        const currentDistance = distanceWgs84(
          startLatitude,
          startLongitude,
          waypointsLatitudes[i],
          waypointsLongitudes[i],
        );
        if (routeStartPointDistance + currentDistance >= distanceForPixel) {
          routeSegmentIndex = i;
          break;
        }
        routeStartPointDistance += currentDistance;
        startLatitude = waypointsLatitudes[i];
        startLongitude = waypointsLongitudes[i];
      }

      if (routeSegmentIndex >= waypointsPointCount) {
        output[threadX] = InvalidElevation;
        continue;
      }

      const remainingDistance = (distanceForPixel - routeStartPointDistance) * 1852.0;
      const bearing = bearingWgs84(
        startLatitude,
        startLongitude,
        waypointsLatitudes[routeSegmentIndex],
        waypointsLongitudes[routeSegmentIndex],
      );
      const centerPosition = projectWgs84(startLatitude, startLongitude, bearing, remainingDistance);

      let bearingStart = bearing - 90.0;
      if (bearingStart < 0.0) bearingStart += 360.0;
      let bearingEnd = bearing + 90.0;
      if (bearingEnd >= 360.0) bearingEnd -= 360.0;
      const offsetMeters = (pathOffset * 1852.0) / 2;

      const startProjected = projectWgs84(centerPosition[0], centerPosition[1], bearingStart, offsetMeters);
      const startPixel = wgs84toPixelCoordinate(
        latitude,
        startProjected[0],
        startProjected[1],
        groundTruthLatitude,
        groundTruthLongitude,
        worldMapSouthwestLat,
        worldMapSouthwestLong,
        worldMapNortheastLat,
        worldMapNortheastLong,
        worldMapWidth,
        worldMapHeight,
        currentWorldGridX,
        currentWorldGridY,
      );
      const endProjected = projectWgs84(centerPosition[0], centerPosition[1], bearingEnd, offsetMeters);
      const endPixel = wgs84toPixelCoordinate(
        latitude,
        endProjected[0],
        endProjected[1],
        groundTruthLatitude,
        groundTruthLongitude,
        worldMapSouthwestLat,
        worldMapSouthwestLong,
        worldMapNortheastLat,
        worldMapNortheastLong,
        worldMapWidth,
        worldMapHeight,
        currentWorldGridX,
        currentWorldGridY,
      );

      const deltaX = Math.abs(endPixel[0] - startPixel[0]);
      const stepX = startPixel[0] < endPixel[0] ? 1 : -1;
      const deltaY = -1.0 * Math.abs(endPixel[1] - startPixel[1]);
      const stepY = startPixel[1] < endPixel[1] ? 1 : -1;
      let error = deltaX + deltaY;
      let maxElevation = -1000;
      let x = startPixel[0];
      let y = startPixel[1];

      while (true) {
        if (y >= 0 && y < worldMapHeight && x >= 0 && x < worldMapWidth) {
          const elevation = worldMap[y][x];
          if (elevation !== InvalidElevation && elevation !== UnknownElevation && elevation > maxElevation) {
            maxElevation = elevation;
          }
        }
        if (x === endPixel[0] && y === endPixel[1]) break;
        const errorDouble = 2.0 * error;
        if (errorDouble >= deltaY) {
          if (x === endPixel[0]) break;
          error += deltaY;
          x += stepX;
        }
        if (errorDouble <= deltaX) {
          if (y === endPixel[1]) break;
          error += deltaX;
          y += stepY;
        }
      }

      output[threadX] = maxElevation;
    }

    return output;
  }
}
