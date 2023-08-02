import { GPU, IKernelRunShortcut } from 'gpu.js';
import {
    RenderingColorChannelCount,
    InvalidElevation,
    UnknownElevation,
    WaterElevation,
    GpuProcessingActive,
    RenderingMapFrameValidityTime,
    RenderingMapTransitionDuration,
    RenderingMapTransitionDeltaTime,
} from './generic/constants';
import { fastFlatten } from './generic/helper';
import { renderVerticalDisplay } from './gpu/rendering/verticaldisplay';
import { VerticalDisplayConstants } from './gpu/interfaces';
import { Logger } from './logging/logger';
import { MapHandler } from './maphandler';
import { AircraftStatus, DisplaySide, ElevationProfile, VerticalDisplay } from '../types';

const RenderingElevationProfileWidth = 600;
const RenderingElevationProfileHeight = 250;

export class VerticalDisplayRenderer {
    private renderer: IKernelRunShortcut = null;

    private elevationConfig: ElevationProfile = {
        pathWidth: 1.0,
        waypointsLatitudes: [],
        waypointsLongitudes: [],
        range: 0.0,
    };

    private displayConfig: VerticalDisplay = { range: 0.0 };

    private renderingData: {
        startTransitionBorder: number,
        currentTransitionBorder: number,
        frameCounter: number,
        finalFrame: Uint8ClampedArray,
        lastFrame: Uint8ClampedArray,
        currentFrame: Uint8ClampedArray,
    } = {
        startTransitionBorder: 0,
        currentTransitionBorder: 0,
        frameCounter: 0,
        finalFrame: null,
        lastFrame: null,
        currentFrame: null,
    };

    constructor(private readonly maphandler: MapHandler, private logging: Logger, private readonly gpu: GPU, private readonly startupTime: number) {
        this.renderer = this.gpu
            .createKernel(renderVerticalDisplay, {
                dynamicArguments: true,
                dynamicOutput: false,
                pipeline: false,
                immutable: false,
            })
            .setConstants<VerticalDisplayConstants>({
                elevationProfileEntryCount: RenderingElevationProfileWidth,
                invalidElevation: InvalidElevation,
                unknownElevation: UnknownElevation,
                waterElevation: WaterElevation,
                maxImageHeight: RenderingElevationProfileHeight,
            })
            .setOutput([RenderingElevationProfileWidth * RenderingColorChannelCount, RenderingElevationProfileHeight]);
    }

    public shutdown(): void {
        this.renderer.destroy();
    }

    public async initialize(): Promise<boolean> {
        this.elevationConfig = {
            pathWidth: 1.0,
            waypointsLatitudes: [
                47.26081085205078,
            ],
            waypointsLongitudes: [
                11.349658966064453,
            ],
            range: 20.0,
        };

        this.startNewMapCycle();

        return true;
    }

    public aircraftStatusUpdate(status: AircraftStatus, side: DisplaySide): void {
        if (side === DisplaySide.Left) {
            this.elevationConfig.range = status.navigationDisplayCapt.range;
            this.displayConfig.range = status.navigationDisplayCapt.range;
        } else {
            this.elevationConfig.range = status.navigationDisplayFO.range;
            this.displayConfig.range = status.navigationDisplayFO.range;
        }
    }

    public reset(): void {
        this.renderingData = {
            startTransitionBorder: 0,
            currentTransitionBorder: 0,
            frameCounter: 0,
            finalFrame: null,
            lastFrame: null,
            currentFrame: null,
        };

        this.elevationConfig = {
            pathWidth: 1.0,
            waypointsLatitudes: [],
            waypointsLongitudes: [],
            range: 0.0,
        };

        this.displayConfig = { range: 0.0 };
    }

    public startNewMapCycle(): void {
        if (this.elevationConfig === null) return;

        this.displayConfig.mapWidth = RenderingElevationProfileWidth;
        this.displayConfig.mapHeight = RenderingElevationProfileHeight;

        const profile = this.maphandler.createElevationProfile(this.elevationConfig, RenderingElevationProfileWidth);
        if (profile === null) return;

        // TODO fix min and max
        const verticaldisplay = this.renderer(profile, 0, 38000) as number[][];

        // some GPU drivers require the flush call to release internal memory
        if (GpuProcessingActive) this.renderer.context.flush();

        this.renderingData.finalFrame = new Uint8ClampedArray(fastFlatten(verticaldisplay));

        if (this.renderingData.lastFrame === null) {
            const timeSinceStart = new Date().getTime() - this.startupTime;
            const frameUpdateCount = timeSinceStart / RenderingMapFrameValidityTime;
            const ratioSinceLastFrame = frameUpdateCount - Math.floor(frameUpdateCount);

            this.renderingData.startTransitionBorder = Math.floor(RenderingElevationProfileWidth * ratioSinceLastFrame);
        } else {
            this.renderingData.startTransitionBorder = 0;
        }

        this.renderingData.currentTransitionBorder = this.renderingData.startTransitionBorder;
    }

    private transitionFrame(
        oldFrame: Uint8ClampedArray,
        newFrame: Uint8ClampedArray,
    ): Uint8ClampedArray {
        if (newFrame === null) return null;

        const result = new Uint8ClampedArray(RenderingElevationProfileWidth * RenderingColorChannelCount * RenderingElevationProfileHeight);

        // access data as uint32-array due to performance reasons
        const destination = new Uint32Array(result.buffer);
        // UInt32-version of RGBA (4, 4, 5, 255)
        destination.fill(4278518788);
        const oldSource = oldFrame !== null ? new Uint32Array(oldFrame.buffer) : null;
        const newSource = new Uint32Array(newFrame.buffer);

        let arrayIndex = 0;
        for (let y = 0; y < RenderingElevationProfileHeight; ++y) {
            for (let x = 0; x < RenderingElevationProfileWidth; ++x) {
                if (x <= this.renderingData.startTransitionBorder && x >= this.renderingData.currentTransitionBorder) {
                    destination[arrayIndex] = newSource[arrayIndex];
                } else if (oldSource !== null) {
                    destination[arrayIndex] = oldSource[arrayIndex];
                }

                arrayIndex++;
            }
        }

        return result;
    }

    public render(): boolean {
        const horizontalStep = Math.round((RenderingElevationProfileWidth / RenderingMapTransitionDuration) * RenderingMapTransitionDeltaTime);
        this.renderingData.currentTransitionBorder += horizontalStep;

        if (this.renderingData.currentTransitionBorder < RenderingElevationProfileWidth) {
            this.renderingData.currentFrame = this.transitionFrame(
                this.renderingData.lastFrame,
                this.renderingData.finalFrame,
            );

            return false;
        }

        // perform the last frame
        if (this.renderingData.currentTransitionBorder + horizontalStep > RenderingElevationProfileWidth) {
            this.renderingData.currentFrame = this.transitionFrame(
                this.renderingData.lastFrame,
                this.renderingData.finalFrame,
            );
        }

        // do not overwrite the last frame of the initialization
        this.renderingData.lastFrame = this.renderingData.currentFrame;

        return true;
    }

    public displayConfiguration(): VerticalDisplay {
        return this.displayConfig;
    }

    public currentFrame(): Uint8ClampedArray {
        return this.renderingData.currentFrame;
    }
}
