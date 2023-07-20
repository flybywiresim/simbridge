import { GPU } from 'gpu.js';
import { parentPort } from 'worker_threads';
import * as sharp from 'sharp';
import {
    AircraftStatus,
    DisplaySide,
    MainToWorkerThreadMessage,
    MainToWorkerThreadMessageTypes,
    NavigationDisplay,
    PositionData,
    TerrainLevelMode,
    TerrainRenderingMode,
    WorkerToMainThreadMessageTypes,
} from '../types';
import { SimConnect } from '../communication/simconnect';
import { NavigationDisplayThresholdsDto } from '../dto/navigationdisplaythresholds.dto';
import {
    GpuProcessingActive,
    NavigationDisplayMapStartOffsetY,
    NavigationDisplayMaxPixelHeight,
    NavigationDisplayMaxPixelWidth,
    RenderingColorChannelCount,
    RenderingMapTransitionDeltaTime,
    RenderingMapUpdateTimeout,
} from './generic/constants';
import { Logger } from './logging/logger';
import { ThreadLogger } from './logging/threadlogger';
import { MapHandler } from './maphandler';
import { NavigationDisplayRenderer } from './navigationdisplayrenderer';

const DisplayScreenPixelHeight = 768;

class TerrainWorker {
    private initialized: boolean = false;

    private simconnect: SimConnect = null;

    private simPaused: boolean = true;

    private gpu: GPU = null;

    private mapHandler: MapHandler = null;

    private displayRendering: {
        [side: string]: {
            timeout: NodeJS.Timeout,
            durationInterval: NodeJS.Timer,
            startupTimestamp: number,
            navigationDisplay: NavigationDisplayRenderer,
            cycleData: {
                timestamp: number,
                thresholds: NavigationDisplayThresholdsDto,
                frames: Uint8ClampedArray[],
            },
        }
    } = {}

    private onReset(): void {
        if (this.initialized === false) return;

        if (this.mapHandler !== null) this.mapHandler.reset();
        if (this.displayRendering.L.navigationDisplay !== null) this.displayRendering.L.navigationDisplay.reset();
        if (this.displayRendering.R.navigationDisplay !== null) this.displayRendering.R.navigationDisplay.reset();
    }

    private onPaused(): void {
        this.simPaused = true;
    }

    private onUnpaused(): void {
        this.simPaused = false;
    }

    private onPositionUpdate(data: PositionData): void {
        if (this.initialized === false) return;

        if (this.mapHandler !== null) this.mapHandler.positionUpdate(data);
    }

    private updateRendering(side: DisplaySide, status: AircraftStatus) {
        if (this.displayRendering[side].navigationDisplay === null) return;

        const configuration = side === DisplaySide.Left ? status.navigationDisplayCapt : status.navigationDisplayFO;
        const lastConfig = this.displayRendering[side].navigationDisplay.displayConfiguration();
        const stopRendering = !configuration.active && lastConfig !== null && lastConfig.active;
        let startRendering = configuration.active && (lastConfig === null || !lastConfig.active);

        startRendering ||= lastConfig !== null && ((lastConfig.range !== configuration.range) || (lastConfig.arcMode !== configuration.arcMode));
        startRendering ||= lastConfig !== null && (lastConfig.efisMode !== configuration.efisMode);

        if (stopRendering || startRendering) {
            if (this.displayRendering[side].durationInterval !== null) {
                clearInterval(this.displayRendering[side].durationInterval);
                this.displayRendering[side].durationInterval = null;
            }
            if (this.displayRendering[side].timeout !== null) {
                clearTimeout(this.displayRendering[side].timeout);
                this.displayRendering[side].timeout = null;
            }

            this.displayRendering[side].navigationDisplay.reset();

            // reset also the aircraft data
            this.simconnect.sendNavigationDisplayTerrainMapMetadata(side, {
                MinimumElevation: -1,
                MinimumElevationMode: TerrainLevelMode.PeaksMode,
                MaximumElevation: -1,
                MaximumElevationMode: TerrainLevelMode.PeaksMode,
                FirstFrame: true,
                DisplayRange: 0,
                DisplayMode: 0,
                FrameByteCount: 0,
            });
        }

        this.displayRendering[side].navigationDisplay.aircraftStatusUpdate(status, side, false);

        if (startRendering) {
            this.startNavigationDisplayRenderingCycle(side);
        }
    }

    private onAircraftStatusUpdate(data: AircraftStatus): void {
        if (this.initialized === false) return;

        if (this.mapHandler !== null) this.mapHandler.aircraftStatusUpdate(data);
        this.updateRendering(DisplaySide.Left, data);
        this.updateRendering(DisplaySide.Right, data);
    }

    constructor(private logging: Logger) {
        this.simconnect = new SimConnect(this.logging);
        this.simconnect.addUpdateCallback('reset', () => this.onReset());
        this.simconnect.addUpdateCallback('paused', () => this.onPaused());
        this.simconnect.addUpdateCallback('unpaused', () => this.onUnpaused());
        this.simconnect.addUpdateCallback('positionUpdate', (data: PositionData) => this.onPositionUpdate(data));
        this.simconnect.addUpdateCallback('aircraftStatusUpdate', (data: AircraftStatus) => this.onAircraftStatusUpdate(data));

        this.gpu = new GPU({ mode: GpuProcessingActive === true ? 'gpu' : 'cpu' });

        const startupTime = new Date().getTime();

        /* create the map handler */
        this.mapHandler = new MapHandler(this.logging, this.gpu);

        /* create the sides */
        this.displayRendering.L = {
            timeout: null,
            durationInterval: null,
            startupTimestamp: startupTime,
            navigationDisplay: new NavigationDisplayRenderer(this.mapHandler, this.logging, this.gpu, startupTime),
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
            cycleData: {
                timestamp: 0,
                thresholds: null,
                frames: null,
            },
        };

        this.mapHandler.initialize().then((initialized) => {
            if (initialized === true) {
                this.logging.info('Initialized the map handler');

                const startupNdConfigL: NavigationDisplay = {
                    range: 20,
                    arcMode: true,
                    active: true,
                    efisMode: 0,
                    mapOffsetX: 0,
                    mapWidth: NavigationDisplayMaxPixelWidth,
                    mapHeight: NavigationDisplayMaxPixelHeight,
                };
                const startupNdConfigR: NavigationDisplay = {
                    range: 10,
                    arcMode: true,
                    active: false,
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
                    navigationDisplayCapt: startupNdConfigL,
                    navigationDisplayFO: startupNdConfigR,
                    navigationDisplayRenderingMode: TerrainRenderingMode.ArcMode,
                };

                this.displayRendering.L.navigationDisplay.aircraftStatusUpdate(startupStatus, DisplaySide.Left, true);
                this.displayRendering.R.navigationDisplay.aircraftStatusUpdate(startupStatus, DisplaySide.Right, true);

                Promise.all([
                    this.displayRendering.L.navigationDisplay.initialize(),
                    this.displayRendering.R.navigationDisplay.initialize(),
                ]).then((ndInitialized) => {
                    if (ndInitialized[0] === true && ndInitialized[1] === true) {
                        this.logging.info('Initialized the ND renderers');
                    } else {
                        this.logging.error('Unable to initialize the ND renderers');
                    }

                    this.mapHandler.reset();
                    this.displayRendering.L.navigationDisplay.reset();
                    this.displayRendering.R.navigationDisplay.reset();

                    this.initialized = true;
                    this.logging.info('Terrainmap worker initialized');
                });
            } else {
                this.logging.error('Unable to initialize the map handler');
            }
        });
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
        if (this.mapHandler !== null) this.mapHandler.shutdown();

        if (this.simconnect !== null) this.simconnect.terminate();
        if (this.gpu !== null) this.gpu.destroy();
    }

    private createScreenResolutionFrame(side: DisplaySide, navigationDisplay: Uint8ClampedArray): Uint8ClampedArray {
        const result = new Uint8ClampedArray(NavigationDisplayMaxPixelWidth * RenderingColorChannelCount * DisplayScreenPixelHeight);

        // access data as uint32-array for performance reasons
        const destination = new Uint32Array(result.buffer);
        // UInt32-version of RGBA (4, 4, 5, 255)
        destination.fill(4278518788);

        if (navigationDisplay !== null) {
            const source = new Uint32Array(navigationDisplay.buffer);
            const displayConfiguration = this.displayRendering[side].navigationDisplay.displayConfiguration();

            // manual iteration is 2x faster compared to splice
            for (let y = 0; y < displayConfiguration.mapHeight; ++y) {
                let destinationIndex = (NavigationDisplayMapStartOffsetY + y) * NavigationDisplayMaxPixelWidth + displayConfiguration.mapOffsetX;
                let sourceIndex = y * displayConfiguration.mapWidth;

                for (let x = 0; x < displayConfiguration.mapWidth; ++x) {
                    destination[destinationIndex] = source[sourceIndex];
                    destinationIndex++;
                    sourceIndex++;
                }
            }
        }

        return result;
    }

    public startNavigationDisplayRenderingCycle(side: DisplaySide): void {
        if (this.displayRendering[side].timeout !== null) {
            clearTimeout(this.displayRendering[side].timeout);
            this.displayRendering[side].timeout = null;
        }
        if (this.displayRendering[side].durationInterval !== null) {
            clearInterval(this.displayRendering[side].durationInterval);
            this.displayRendering[side].durationInterval = null;
        }

        this.displayRendering[side].navigationDisplay.startNewMapCycle();
        this.displayRendering[side].cycleData.frames = [];

        this.displayRendering[side].durationInterval = setInterval(() => {
            const lastFrameCreated = this.displayRendering[side].navigationDisplay.render();
            const ndMap = this.displayRendering[side].navigationDisplay.currentFrame();

            const frame = this.createScreenResolutionFrame(side, ndMap);

            if (frame !== null && this.simPaused === false) {
                sharp(frame, { raw: { width: NavigationDisplayMaxPixelWidth, height: DisplayScreenPixelHeight, channels: RenderingColorChannelCount } })
                    .png()
                    .toBuffer()
                    .then((buffer) => {
                        const displayData = this.displayRendering[side].navigationDisplay.displayData();
                        displayData.FrameByteCount = buffer.byteLength;
                        displayData.FirstFrame = this.displayRendering[side].cycleData.frames.length === 0;

                        this.simconnect.sendNavigationDisplayTerrainMapMetadata(side, displayData);
                        this.simconnect.sendNavigationDisplayTerrainMapFrame(side, buffer);

                        // store the data for the web UI
                        this.displayRendering[side].cycleData.frames.push(new Uint8ClampedArray(buffer));
                    });
            }

            if (lastFrameCreated === true) {
                if (this.displayRendering[side].durationInterval !== null) {
                    clearInterval(this.displayRendering[side].durationInterval);
                    this.displayRendering[side].durationInterval = null;
                }

                this.displayRendering[side].cycleData.thresholds = {
                    minElevation: this.displayRendering[side].navigationDisplay.displayData().MinimumElevation,
                    minElevationIsWarning: this.displayRendering[side].navigationDisplay.displayData().MinimumElevationMode === TerrainLevelMode.Warning,
                    minElevationIsCaution: this.displayRendering[side].navigationDisplay.displayData().MinimumElevationMode === TerrainLevelMode.Caution,
                    maxElevation: this.displayRendering[side].navigationDisplay.displayData().MaximumElevation,
                    maxElevationIsWarning: this.displayRendering[side].navigationDisplay.displayData().MaximumElevationMode === TerrainLevelMode.Warning,
                    maxElevationIsCaution: this.displayRendering[side].navigationDisplay.displayData().MaximumElevationMode === TerrainLevelMode.Warning,
                };

                if (this.displayRendering[side].timeout !== null) {
                    clearTimeout(this.displayRendering[side].timeout);
                    this.displayRendering[side].timeout = null;
                }

                if (this.displayRendering[side].navigationDisplay.displayConfiguration().active === true) {
                    this.displayRendering[side].timeout = setTimeout(() => this.startNavigationDisplayRenderingCycle(side), RenderingMapUpdateTimeout);
                }
            }
        }, RenderingMapTransitionDeltaTime);
    }

    public frameData(side: string): { side: string, timestamp: number, thresholds: NavigationDisplayThresholdsDto, frames: Uint8ClampedArray[] } {
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

parentPort.on('message', (data: MainToWorkerThreadMessage) => {
    if (data.type === MainToWorkerThreadMessageTypes.FrameData) {
        parentPort.postMessage({ type: WorkerToMainThreadMessageTypes.FrameData, content: terrainWorker.frameData(data.content) });
    } else if (data.type === MainToWorkerThreadMessageTypes.Shutdown) {
        terrainWorker.shutdown();
    }
});
