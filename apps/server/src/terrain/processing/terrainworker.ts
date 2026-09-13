import { GPU } from 'gpu.js';
import { parentPort } from 'worker_threads';
import * as sharp from 'sharp';
import {
  AircraftStatus,
  DisplaySide,
  MainToWorkerThreadMessage,
  MainToWorkerThreadMessageTypes,
  EfisData,
  PositionData,
  TerrainLevelMode,
  TerrainRenderingMode,
  VerticalPathData,
  WorkerToMainThreadMessageTypes,
} from '../types';
import { SimConnect } from '../communication/simconnect';
import { NavigationDisplayThresholdsDto } from '../dto/navigationdisplaythresholds.dto';
import {
  GpuProcessingActive,
  NauticalMilesToMetres,
  TerrainDiagnosticsEnabled,
  NavigationDisplayMapStartOffsetY,
  NavigationDisplayMaxPixelHeight,
  NavigationDisplayMaxPixelWidth,
  RenderingColorChannelCount,
  RenderingMapTransitionDeltaTime,
  RenderingMapUpdateTimeoutArcMode,
  RenderingMapUpdateTimeoutScanlineMode,
  VerticalDisplayMapStartOffsetX,
  VerticalDisplayMapStartOffsetY,
} from './generic/constants';
import { Logger } from './logging/logger';
import { ThreadLogger } from './logging/threadlogger';
import { memorySnapshot } from './generic/memory';
import { MapHandler } from './maphandler';
import { NavigationDisplayRenderer } from './navigationdisplayrenderer';
import { VerticalDisplayRenderer } from './verticaldisplayrenderer';
import { projectWgs84 } from 'apps/server/src/terrain/processing/gpu/helper';

// a new sharp pipeline runs every 40ms per side; libvips' default cache (50MB +
// 100 open files) is native memory V8 never sees and never reclaims here, and
// every encode is a one-shot raw->png so nothing is worth caching
sharp.cache(false);
sharp.concurrency(1);

const DisplayScreenPixelHeightWithoutVerticalDisplay = 768;
const DisplayScreenPixelHeightWithVerticalDisplay = 1024;

const SimBridgeClientDataTimeout = 2 * 60 * 1_000; // ms, equals two minutes

class TerrainWorker {
  private initialized: boolean = false;

  private terrainInitialized: boolean = false;

  private terrainActive: boolean = false;

  private simconnect: SimConnect = null;

  private simPaused: boolean = true;

  private renderingMode: TerrainRenderingMode = TerrainRenderingMode.ArcMode;

  private manualAzimEnabled: boolean = true;
  private manualAzimDegrees: number = 0;
  private manualAzimEndPoint: [number, number] | null = null;

  private currentTrackChangesSignificantlyAtDistance: { [side: string]: number } = { L: -1, R: -1 };

  private simBridgeClientUsed = false;
  public simBridgeClientTimeout: NodeJS.Timeout = null;

  private gpu: GPU = null;

  private mapHandler: MapHandler = null;

  private initializing: boolean = false;

  private displayDimension: {
    width: number;
    height: number;
  } = {
    width: 0,
    height: 0,
  };

  private verticalDisplayRequired: boolean = false;

  private displayRendering: {
    [side: string]: {
      timeout: NodeJS.Timeout;
      durationInterval: NodeJS.Timer;
      startupTimestamp: number;
      navigationDisplay: NavigationDisplayRenderer;
      renderedLastFrameNavigationDisplay: boolean;
      verticalDisplay: VerticalDisplayRenderer;
      renderedLastFrameVerticalDisplay: boolean;
      processing: boolean;
      screenFrame: Uint8ClampedArray;
      cycleData: {
        timestamp: number;
        thresholds: NavigationDisplayThresholdsDto;
        frames: Uint8ClampedArray[];
      };
    };
  } = {};

  private lastMemoryReport = 0;

  // rss is process-wide (main thread + every worker isolate), heap/external are this
  // isolate only — so do not subtract one from the other and call the remainder native.
  // The per-space split is the useful part: large_object_space is big TypedArrays and
  // arrays (allocation churn), old_space is many small long-lived objects (retention).
  public reportMemory(label: string, force = false): void {
    if (!TerrainDiagnosticsEnabled) return;

    const now = Date.now();
    if (!force && now - this.lastMemoryReport < 30_000) return;
    this.lastMemoryReport = now;

    this.logging.info(`Terrain memory [${label}]: ${memorySnapshot()}`);
  }

  private onReset(): void {
    if (this.initialized === false) return;

    if (this.mapHandler !== null) this.mapHandler.reset();
    if (this.displayRendering.L.navigationDisplay !== null) this.displayRendering.L.navigationDisplay.reset();
    if (this.displayRendering.L.verticalDisplay !== null) this.displayRendering.L.verticalDisplay.reset(true);
    if (this.displayRendering.R.navigationDisplay !== null) this.displayRendering.R.navigationDisplay.reset();
    if (this.displayRendering.R.verticalDisplay !== null) this.displayRendering.R.verticalDisplay.reset(true);
  }

  private onPaused(): void {
    this.simPaused = true;
  }

  private onUnpaused(): void {
    this.simPaused = false;
  }

  public enableSimBridgeClientData(): void {
    if (!this.simBridgeClientUsed) {
      this.logging.info('SimBridge client data received, ignoring SimConnect aircraftStatusUpdate from now on.');
    }
    this.simBridgeClientUsed = true;
  }

  public disableSimBridgeClientData(): void {
    if (this.simBridgeClientUsed) {
      this.logging.info('SimBridge client data stopped (due to timeout), resuming SimConnect aircraftStatusUpdate.');
    }
    this.simBridgeClientUsed = false;
  }

  private async onPositionUpdate(data: PositionData): Promise<void> {
    if (!this.terrainActive || this.initialized === false || !data) return;
    if (this.mapHandler !== null) await this.mapHandler.positionUpdate(data);
  }

  private updateRendering(side: DisplaySide, status: AircraftStatus) {
    if (this.displayRendering[side].navigationDisplay === null) return;

    const configuration = side === DisplaySide.Left ? status.efisDataCapt : status.efisDataFO;
    const lastConfig = this.displayRendering[side].navigationDisplay.displayConfiguration();

    // left and right can have different ranges, use the larger one
    const maxRange = Math.max(status.efisDataCapt.ndRange, status.efisDataFO.ndRange);
    if (this.mapHandler !== null && maxRange > 0) {
      this.mapHandler.setVisibilityRange(maxRange);
    }

    const configChanged =
      lastConfig !== null &&
      (lastConfig.efisMode !== configuration.efisMode ||
        lastConfig.ndRange !== configuration.ndRange ||
        lastConfig.arcMode !== configuration.arcMode ||
        lastConfig.terrOnNd !== configuration.terrOnNd ||
        lastConfig.terrOnVd !== configuration.terrOnVd);
    const stopRendering =
      lastConfig !== null &&
      ((lastConfig.terrOnNd && !configuration.terrOnNd) || (lastConfig.terrOnVd && !configuration.terrOnVd));
    const startRendering =
      configChanged ||
      this.manualAzimEnabled !== status.manualAzimEnabled ||
      (lastConfig === null && configuration !== null);

    if (stopRendering || startRendering) {
      this.resetRenderingCycle(side);
    }

    this.displayRendering[side].navigationDisplay.aircraftStatusUpdate(status, side, false);
    this.displayRendering[side].verticalDisplay.aircraftStatusUpdate(status, side);

    if (this.manualAzimEnabled) {
      this.manualAzimEndPoint = projectWgs84(
        status.latitude,
        status.longitude,
        status.heading,
        160 * NauticalMilesToMetres,
      );
      this.displayRendering[side].verticalDisplay.pathDataUpdate({
        pathWidth: 1.0,
        trackChangesSignificantlyAtDistance: -1,
        waypoints: [{ latitude: this.manualAzimEndPoint[0], longitude: this.manualAzimEndPoint[1] }],
      });
    }

    if (startRendering) {
      this.startNavigationDisplayRenderingCycle(side);
    }
  }

  private updatePathData(side: DisplaySide, path: VerticalPathData) {
    let forceRedraw = false;
    forceRedraw ||= this.displayRendering[side].navigationDisplay.displayConfiguration() === null;
    forceRedraw ||= this.displayRendering[side].verticalDisplay.numPathElements() !== path.waypoints.length;
    forceRedraw ||=
      Math.abs(path.trackChangesSignificantlyAtDistance - this.currentTrackChangesSignificantlyAtDistance[side]) >
        0.1 ||
      Math.sign(path.trackChangesSignificantlyAtDistance) !==
        Math.sign(this.currentTrackChangesSignificantlyAtDistance[side]);

    if (forceRedraw) {
      this.resetRenderingCycle(side, true);
    }

    if (this.manualAzimEnabled || path.waypoints.length === 0) {
      const waypoints =
        this.manualAzimEndPoint === null
          ? []
          : [{ latitude: this.manualAzimEndPoint[0], longitude: this.manualAzimEndPoint[1] }];
      const pathData = {
        pathWidth: 1.0,
        trackChangesSignificantlyAtDistance: -1,
        waypoints: waypoints,
      };
      this.displayRendering[side].verticalDisplay.pathDataUpdate(pathData);
    } else {
      this.displayRendering[side].verticalDisplay.pathDataUpdate(path);
    }
    this.currentTrackChangesSignificantlyAtDistance[side] = path.trackChangesSignificantlyAtDistance;

    if (forceRedraw) {
      this.startNavigationDisplayRenderingCycle(side);
    }
  }

  public onAircraftStatusUpdate(data: AircraftStatus): void {
    if (!data) return;

    const wasTerrainActive = this.terrainActive;
    const needsTerrain =
      data.efisDataCapt.terrOnNd || data.efisDataCapt.terrOnVd || data.efisDataFO.terrOnNd || data.efisDataFO.terrOnVd;

    if (needsTerrain && !wasTerrainActive) {
      this.initializeTerrain();
    } else if (!needsTerrain && wasTerrainActive) {
      this.unloadTerrain();
    }

    // if terrain not loaded or worker not ready, just store status — skip rendering
    if (!this.terrainActive || this.initialized === false) {
      if (this.mapHandler !== null) this.mapHandler.aircraftStatusUpdate(data);
      return;
    }

    // eslint-disable-next-line no-bitwise
    this.verticalDisplayRequired =
      (data.navigationDisplayRenderingMode & TerrainRenderingMode.VerticalDisplayRequired) ===
      TerrainRenderingMode.VerticalDisplayRequired;

    // eslint-disable-next-line no-bitwise
    this.renderingMode =
      data.navigationDisplayRenderingMode & (TerrainRenderingMode.ArcMode | TerrainRenderingMode.ScanlineMode);

    this.manualAzimEnabled = data.manualAzimEnabled;
    this.manualAzimDegrees = data.manualAzimDegrees;
    this.manualAzimEndPoint = data.manualAzimEnabled
      ? projectWgs84(data.latitude, data.longitude, this.manualAzimDegrees, 160 * NauticalMilesToMetres)
      : null;

    if (this.verticalDisplayRequired === true) {
      this.displayDimension.height = DisplayScreenPixelHeightWithVerticalDisplay;
    } else {
      this.displayDimension.height = DisplayScreenPixelHeightWithoutVerticalDisplay;
    }
    this.displayDimension.width = NavigationDisplayMaxPixelWidth;

    if (this.mapHandler !== null) this.mapHandler.aircraftStatusUpdate(data);
    this.updateRendering(DisplaySide.Left, data);
    this.updateRendering(DisplaySide.Right, data);
  }

  public onVerticalPathDataUpdate(data: VerticalPathData): void {
    if (this.initialized === false || !this.terrainActive) return;

    this.updatePathData(DisplaySide.Left, data);
    this.updatePathData(DisplaySide.Right, data);
  }

  constructor(public logging: Logger) {
    this.simconnect = new SimConnect(this.logging);
    this.simconnect.addUpdateCallback('reset', () => this.onReset());
    this.simconnect.addUpdateCallback('paused', () => this.onPaused());
    this.simconnect.addUpdateCallback('unpaused', () => this.onUnpaused());
    this.simconnect.addUpdateCallback('positionUpdate', (data: PositionData) => this.onPositionUpdate(data));
    this.simconnect.addUpdateCallback('aircraftStatusUpdate', (data: AircraftStatus) => {
      if (!this.simBridgeClientUsed) {
        // Only react to SimConnect updates for AircraftStatus if no SimBridge-Client data has been received
        this.onAircraftStatusUpdate(data);
      }
    });

    try {
      this.gpu = new GPU({ mode: GpuProcessingActive === true ? 'gpu' : 'cpu' });
    } catch (err) {
      this.logging.warn(`GPU mode failed (${err.message}), falling back to CPU`);
      this.gpu = new GPU({ mode: 'cpu' });
    }

    const startupTime = new Date().getTime();

    /* create the map handler */
    this.mapHandler = new MapHandler(this.logging, this.gpu);

    /* create the sides */
    this.displayRendering.L = {
      timeout: null,
      durationInterval: null,
      startupTimestamp: startupTime,
      navigationDisplay: new NavigationDisplayRenderer(this.mapHandler, this.logging, this.gpu, startupTime),
      renderedLastFrameNavigationDisplay: false,
      verticalDisplay: new VerticalDisplayRenderer(this.mapHandler, this.logging, this.gpu, startupTime),
      renderedLastFrameVerticalDisplay: false,
      processing: false,
      screenFrame: null,
      cycleData: {
        timestamp: 0,
        thresholds: null,
        frames: null,
      },
    };
    this.displayRendering.R = {
      timeout: null,
      durationInterval: null,
      // offset the rendering to have a more realistic bahaviour
      startupTimestamp: startupTime - 1500,
      navigationDisplay: new NavigationDisplayRenderer(this.mapHandler, this.logging, this.gpu, startupTime - 1500),
      renderedLastFrameNavigationDisplay: false,
      verticalDisplay: new VerticalDisplayRenderer(this.mapHandler, this.logging, this.gpu, startupTime - 1500),
      renderedLastFrameVerticalDisplay: false,
      processing: false,
      screenFrame: null,
      cycleData: {
        timestamp: 0,
        thresholds: null,
        frames: null,
      },
    };

    // no need to load 231MB file if no simulator is running
    this.logging.info('Terrain worker started (waiting for SimConnect)');
  }

  public initializeTerrain(): void {
    if (this.terrainInitialized || this.initializing) return;
    this.initializing = true;

    this.logging.info('Loading terrain.map (~231MB)...');

    this.mapHandler
      .initialize()
      .then((initialized) => {
        if (initialized === true) {
          this.logging.info('Initialized the map handler');

          const startupNdConfigL: EfisData = {
            ndRange: 20,
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
          const startupNdConfigR: EfisData = {
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
            runwayDataValid: false,
            runwayLatitude: 0.0,
            runwayLongitude: 0.0,
            efisDataCapt: startupNdConfigL,
            efisDataFO: startupNdConfigR,
            navigationDisplayRenderingMode: TerrainRenderingMode.ArcMode,
            manualAzimEnabled: false,
            manualAzimDegrees: 0,
            groundTruthLatitude: 47.26081085205078,
            groundTruthLongitude: 11.349658966064453,
          };

          this.displayRendering.L.navigationDisplay.aircraftStatusUpdate(startupStatus, DisplaySide.Left, true);
          this.displayRendering.R.navigationDisplay.aircraftStatusUpdate(startupStatus, DisplaySide.Right, true);
          this.displayRendering.L.verticalDisplay.aircraftStatusUpdate(startupStatus, DisplaySide.Left);
          this.displayRendering.R.verticalDisplay.aircraftStatusUpdate(startupStatus, DisplaySide.Right);

          Promise.all([
            this.displayRendering.L.navigationDisplay.initialize().catch((e) => {
              this.logging.error(`L-ND init failed (non-fatal): ${e}`);
            }),
            this.displayRendering.R.navigationDisplay.initialize().catch((e) => {
              this.logging.error(`R-ND init failed (non-fatal): ${e}`);
            }),
            this.displayRendering.L.verticalDisplay.initialize().catch((e) => {
              this.logging.error(`L-VD init failed (non-fatal): ${e}`);
            }),
            this.displayRendering.R.verticalDisplay.initialize().catch((e) => {
              this.logging.error(`R-VD init failed (non-fatal): ${e}`);
            }),
          ]).then((ndInitialized) => {
            if (ndInitialized.every((v) => v === true) === true) {
              this.logging.info('Initialized the ND renderers');
            } else {
              this.logging.error('Unable to initialize the ND renderers');
            }

            this.mapHandler.reset();
            this.displayRendering.L.navigationDisplay.reset();
            this.displayRendering.R.navigationDisplay.reset();
            this.displayRendering.L.verticalDisplay.reset(true);
            this.displayRendering.R.verticalDisplay.reset(true);

            this.terrainInitialized = true;
            this.terrainActive = true;
            this.initialized = true;
            this.initializing = false;
            this.logging.info('Terrainmap worker initialized');
          });
        } else {
          this.logging.error('Unable to initialize the map handler');
          this.initializing = false;
        }
      })
      .catch((err) => {
        this.logging.error(`Terrain init failed: ${err.message}\n${err.stack}`);
        this.initializing = false;
      });
  }

  public unloadTerrain(): void {
    if (!this.terrainActive && !this.initializing) return;

    this.logging.info('Unloading terrain data...');
    this.reportMemory('before unload', true);
    this.stopRendering();
    if (this.mapHandler !== null) this.mapHandler.unload();
    this.terrainInitialized = false;
    this.terrainActive = false;
    this.initializing = false;

    // measure instead of claiming a number: GPU kernels are deliberately kept alive
    // (dual-GPU workaround) and the tile worker pool outlives the unload, so what is
    // actually returned is the terrain.map buffer and the decompressed tiles, not
    // everything the terrain subsystem is holding.
    this.reportMemory('after unload', true);
    this.logging.info('Terrain unloaded');
  }

  private resetRendering(side: DisplaySide): void {
    if (this.displayRendering[side].durationInterval !== null) {
      clearInterval(this.displayRendering[side].durationInterval);
      this.displayRendering[side].durationInterval = null;
    }
    if (this.displayRendering[side].timeout !== null) {
      clearTimeout(this.displayRendering[side].timeout);
      this.displayRendering[side].timeout = null;
    }
    if (this.displayRendering[side].navigationDisplay !== null) {
      this.displayRendering[side].navigationDisplay.reset();
      this.displayRendering[side].verticalDisplay.reset(true);

      this.simconnect.sendNavigationDisplayTerrainMapMetadata(
        side,
        this.displayRendering[side].navigationDisplay.displayData(),
      );
    }
  }

  public stopRendering(): void {
    this.resetRendering(DisplaySide.Left);
    this.resetRendering(DisplaySide.Right);
  }

  public shutdown(): void {
    this.stopRendering();

    if (this.displayRendering.L.navigationDisplay !== null) this.displayRendering.L.navigationDisplay.shutdown();
    if (this.displayRendering.R.navigationDisplay !== null) this.displayRendering.R.navigationDisplay.shutdown();
    if (this.displayRendering.L.verticalDisplay !== null) this.displayRendering.L.verticalDisplay.shutdown();
    if (this.displayRendering.R.verticalDisplay !== null) this.displayRendering.R.verticalDisplay.shutdown();
    if (this.mapHandler !== null) this.mapHandler.shutdown();

    if (this.simconnect !== null) this.simconnect.terminate();
    if (this.gpu !== null) this.gpu.destroy();
  }

  private createScreenResolutionFrame(
    side: DisplaySide,
    navigationDisplay: Uint8ClampedArray | null,
    verticalDisplay: Uint8ClampedArray | null,
  ): Uint8ClampedArray {
    // Reused across ticks instead of allocating ~4MB every 40ms. Safe because the caller
    // sets displayRendering[side].processing before handing this buffer to sharp, and the
    // next tick bails out while that flag is set — so an in-flight encode is never racing
    // an overwrite. Keep that guard if this call site is ever restructured.
    const requiredLength = this.displayDimension.width * RenderingColorChannelCount * this.displayDimension.height;
    let result = this.displayRendering[side].screenFrame;
    if (result === null || result.length !== requiredLength) {
      result = new Uint8ClampedArray(requiredLength);
      this.displayRendering[side].screenFrame = result;
    }

    // access data as uint32-array for performance reasons
    const destination = new Uint32Array(result.buffer);
    // UInt32-version of RGBA (4, 4, 5, 0)
    destination.fill(328708);

    if (navigationDisplay !== null) {
      const source = new Uint32Array(navigationDisplay.buffer);
      const displayConfiguration = this.displayRendering[side].navigationDisplay.displayConfiguration();

      // manual iteration is 2x faster compared to splice
      for (let y = 0; y < displayConfiguration.mapHeight; ++y) {
        let destinationIndex =
          (NavigationDisplayMapStartOffsetY + y) * this.displayDimension.width + displayConfiguration.mapOffsetX;
        let sourceIndex = y * displayConfiguration.mapWidth;

        for (let x = 0; x < displayConfiguration.mapWidth; ++x) {
          destination[destinationIndex] = source[sourceIndex];
          destinationIndex++;
          sourceIndex++;
        }
      }
    }

    // add the vertical display map
    if (verticalDisplay !== null) {
      const source = new Uint32Array(verticalDisplay.buffer);
      const displayConfiguration = this.displayRendering[side].verticalDisplay.displayConfiguration();

      for (let y = 0; y < displayConfiguration.mapHeight; ++y) {
        let destinationIndex =
          (VerticalDisplayMapStartOffsetY + y) * this.displayDimension.width + VerticalDisplayMapStartOffsetX;
        let sourceIndex = y * displayConfiguration.mapWidth;

        for (let x = 0; x < displayConfiguration.mapWidth; ++x) {
          destination[destinationIndex++] = source[sourceIndex++];
        }
      }
    }

    return result;
  }

  public resetRenderingCycle(side: DisplaySide, onlyRedraw = false) {
    if (this.displayRendering[side].durationInterval !== null) {
      clearInterval(this.displayRendering[side].durationInterval);
      this.displayRendering[side].durationInterval = null;
    }
    if (this.displayRendering[side].timeout !== null) {
      clearTimeout(this.displayRendering[side].timeout);
      this.displayRendering[side].timeout = null;
    }

    if (!onlyRedraw) {
      // pilot-initiated (range/mode/TERR change): start the sweep from the beginning
      // instead of resuming mid-arc, which left most of the display blank until the
      // next cycle — see NavigationDisplayRenderer.startNewMapCycle()
      this.displayRendering[side].navigationDisplay.reset(true);
      this.displayRendering[side].verticalDisplay.reset(false, true);
    }

    // reset also the aircraft data
    this.simconnect.sendNavigationDisplayTerrainMapMetadata(
      side,
      this.displayRendering[side].navigationDisplay.displayData(),
    );
  }

  public startNavigationDisplayRenderingCycle(side: DisplaySide): void {
    const verticalDisplayRenderedOnSide =
      this.verticalDisplayRequired &&
      this.displayRendering[side].navigationDisplay.displayConfiguration().terrOnVd &&
      [2, 3].includes(this.displayRendering[side].navigationDisplay.displayConfiguration().efisMode);

    const navigationDisplayRenderedOnSide =
      this.displayRendering[side].navigationDisplay.displayConfiguration().terrOnNd;

    if (this.displayRendering[side].timeout !== null) {
      clearTimeout(this.displayRendering[side].timeout);
      this.displayRendering[side].timeout = null;
    }
    if (this.displayRendering[side].durationInterval !== null) {
      clearInterval(this.displayRendering[side].durationInterval);
      this.displayRendering[side].durationInterval = null;
    }

    this.reportMemory('rendering');

    const currentTime = new Date().getTime();
    this.displayRendering[side].renderedLastFrameNavigationDisplay = false;
    this.displayRendering[side].renderedLastFrameVerticalDisplay = false;
    const t0 = Date.now();
    this.displayRendering[side].navigationDisplay.startNewMapCycle(currentTime);
    const t1 = Date.now();
    if (verticalDisplayRenderedOnSide) {
      this.displayRendering[side].verticalDisplay.startNewMapCycle(currentTime);
    }
    const t2 = Date.now();
    this.displayRendering[side].cycleData.frames = [];
    this.logging.debug(`startNewMapCycle ${side}: nd=${t1 - t0}ms vd=${t2 - t1}ms`);

    this.displayRendering[side].durationInterval = setInterval(() => {
      try {
        const tickStart = Date.now();
        if (this.displayRendering[side].processing) return;

        if (this.displayRendering[side].renderedLastFrameNavigationDisplay === false) {
          this.displayRendering[side].renderedLastFrameNavigationDisplay =
            this.displayRendering[side].navigationDisplay.render();
        }
        const ndMap = this.displayRendering[side].navigationDisplay.currentFrame();

        let vdMap: Uint8ClampedArray | null = null;
        if (verticalDisplayRenderedOnSide) {
          if (this.displayRendering[side].renderedLastFrameVerticalDisplay === false) {
            this.displayRendering[side].renderedLastFrameVerticalDisplay =
              this.displayRendering[side].verticalDisplay.render();
          }
          vdMap = this.displayRendering[side].verticalDisplay.currentFrame();
        } else {
          this.displayRendering[side].renderedLastFrameVerticalDisplay = true;
          vdMap = null;
        }

        const frame = this.createScreenResolutionFrame(side, navigationDisplayRenderedOnSide ? ndMap : null, vdMap);

        if (frame !== null && this.simPaused === false) {
          this.displayRendering[side].processing = true;
          try {
            sharp(frame, {
              raw: {
                width: this.displayDimension.width,
                height: this.displayDimension.height,
                channels: RenderingColorChannelCount,
              },
            })
              // This buffer goes straight over local IPC to SimConnect and is immediately
              // consumed - it's never stored or transmitted over a network, so there is no
              // reason to pay for tight zlib compression on every ~40ms transition frame.
              // Lowest compression level trades a larger (still tiny, in-memory) buffer for
              // significantly less CPU time per frame.
              .png({ compressionLevel: 1, adaptiveFiltering: false })
              .toBuffer()
              .then((buffer) => {
                const displayData = this.displayRendering[side].navigationDisplay.displayData();
                displayData.FrameByteCount = buffer.byteLength;
                displayData.FirstFrame = this.displayRendering[side].cycleData.frames.length === 0;

                this.simconnect.sendNavigationDisplayTerrainMapMetadata(side, displayData);
                this.simconnect.sendNavigationDisplayTerrainMapFrame(side, buffer);

                if (this.displayRendering[side].cycleData.frames.length < 3) {
                  this.displayRendering[side].cycleData.frames.push(new Uint8ClampedArray(buffer));
                }
              })
              .catch((err) => {
                this.logging.error(`Sharp encode failed for ${side}: ${err.message}`);
              })
              .finally(() => {
                this.displayRendering[side].processing = false;
              });
          } catch (err) {
            this.logging.error(`Sharp setup failed for ${side}: ${err.message}`);
            this.displayRendering[side].processing = false;
          }
        }

        if (
          this.displayRendering[side].renderedLastFrameNavigationDisplay === true &&
          this.displayRendering[side].renderedLastFrameVerticalDisplay === true
        ) {
          if (this.displayRendering[side].durationInterval !== null) {
            clearInterval(this.displayRendering[side].durationInterval);
            this.displayRendering[side].durationInterval = null;
          }

          this.displayRendering[side].cycleData.thresholds = {
            minElevation: this.displayRendering[side].navigationDisplay.displayData().MinimumElevation,
            minElevationIsWarning:
              this.displayRendering[side].navigationDisplay.displayData().MinimumElevationMode ===
              TerrainLevelMode.Warning,
            minElevationIsCaution:
              this.displayRendering[side].navigationDisplay.displayData().MinimumElevationMode ===
              TerrainLevelMode.Caution,
            maxElevation: this.displayRendering[side].navigationDisplay.displayData().MaximumElevation,
            maxElevationIsWarning:
              this.displayRendering[side].navigationDisplay.displayData().MaximumElevationMode ===
              TerrainLevelMode.Warning,
            maxElevationIsCaution:
              this.displayRendering[side].navigationDisplay.displayData().MaximumElevationMode ===
              TerrainLevelMode.Warning,
          };

          if (this.displayRendering[side].timeout !== null) {
            clearTimeout(this.displayRendering[side].timeout);
            this.displayRendering[side].timeout = null;
          }

          if (
            this.displayRendering[side].navigationDisplay.displayConfiguration().terrOnNd ||
            this.displayRendering[side].navigationDisplay.displayConfiguration().terrOnVd
          ) {
            const timeout =
              this.renderingMode === TerrainRenderingMode.ArcMode
                ? RenderingMapUpdateTimeoutArcMode
                : RenderingMapUpdateTimeoutScanlineMode;
            this.displayRendering[side].timeout = setTimeout(
              () => this.startNavigationDisplayRenderingCycle(side),
              timeout,
            );
          }
        }
        const tickMs = Date.now() - tickStart;
        if (tickMs > 100) {
          this.logging.debug(
            `Render tick ${side}: ${tickMs}ms (transition=${this.displayRendering[side].renderedLastFrameNavigationDisplay})`,
          );
        }
      } catch (err) {
        this.logging.error(`Render tick crashed for ${side}: ${err.message}`);
        this.displayRendering[side].processing = false;
      }
    }, RenderingMapTransitionDeltaTime);
  }

  public frameData(side: string): {
    side: string;
    timestamp: number;
    thresholds: NavigationDisplayThresholdsDto;
    frames: Uint8ClampedArray[];
  } {
    if (side in this.displayRendering) {
      return {
        side,
        timestamp: this.displayRendering[side].cycleData.timestamp,
        thresholds: this.displayRendering[side].cycleData.thresholds,
        frames: this.displayRendering[side].cycleData.frames,
      };
    }

    return { side, timestamp: 0, thresholds: null, frames: [] };
  }
}

const terrainWorker = new TerrainWorker(new ThreadLogger());

process.on('uncaughtException', (err) => {
  terrainWorker['logging'].error(`Worker uncaughtException: ${err.message}\n${err.stack}`);
});

parentPort.on('message', (data: MainToWorkerThreadMessage) => {
  if (data.type === MainToWorkerThreadMessageTypes.FrameData) {
    parentPort.postMessage({
      type: WorkerToMainThreadMessageTypes.FrameData,
      content: terrainWorker.frameData(data.content),
    });
  } else if (data.type === MainToWorkerThreadMessageTypes.Shutdown) {
    terrainWorker.shutdown();
  } else if (data.type === MainToWorkerThreadMessageTypes.AircraftStatusData) {
    terrainWorker.enableSimBridgeClientData();
    terrainWorker.onAircraftStatusUpdate(data.content);

    // Re-start timeout for disabling the SimBridge client data after two minutes of inactivity
    if (terrainWorker.simBridgeClientTimeout !== null) {
      clearTimeout(terrainWorker.simBridgeClientTimeout);
      terrainWorker.simBridgeClientTimeout = null;
    }

    terrainWorker.simBridgeClientTimeout = setTimeout(
      () => terrainWorker.disableSimBridgeClientData(),
      SimBridgeClientDataTimeout,
    );
  } else if (data.type === MainToWorkerThreadMessageTypes.VerticalDisplayPath) {
    terrainWorker.onVerticalPathDataUpdate(data.content);
  }
});
