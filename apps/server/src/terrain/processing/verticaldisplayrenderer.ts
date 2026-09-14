import { GPU, IKernelRunShortcut } from 'gpu.js';
import {
  RenderingColorChannelCount,
  InvalidElevation,
  UnknownElevation,
  WaterElevation,
  GpuProcessingActive,
  RenderingMapTransitionDeltaTime,
  RenderingMapFrameValidityTimeScanlineMode,
  RenderingMapTransitionDurationScanlineMode,
} from './generic/constants';
import { renderVerticalDisplay } from './gpu/rendering/verticaldisplay';
import { VerticalDisplayConstants } from './gpu/interfaces';
import { Logger } from './logging/logger';
import { MapHandler } from './maphandler';
import { AircraftStatus, DisplaySide, ElevationProfile, VerticalDisplay, VerticalPathData } from '../types';
import { verticalDisplayDistanceToPixelX } from 'apps/server/src/terrain/processing/gpu/helper';

const RenderingElevationProfileWidth = 540;
const RenderingElevationProfileHeight = 200;

export class VerticalDisplayRenderer {
  private renderer: IKernelRunShortcut = null;

  private elevationConfig: ElevationProfile = {
    pathWidth: 1.0,
    waypointsLatitudes: [],
    waypointsLongitudes: [],
    range: 0.0,
    trackChangesSignificantlyAtDistance: -1,
  };

  private displayConfig: VerticalDisplay = {
    range: 0.0,
    minimumAltitude: -500,
    maximumAltitude: 24000,
  };

  private renderingData: {
    startTransitionBorder: number;
    currentTransitionBorder: number;
    frameCounter: number;
    finalFrame: Uint8ClampedArray;
    lastFrame: Uint8ClampedArray;
    currentFrame: Uint8ClampedArray;
    forceFullSweep: boolean;
  } = {
    startTransitionBorder: 0,
    currentTransitionBorder: 0,
    frameCounter: 0,
    finalFrame: null,
    lastFrame: null,
    currentFrame: null,
    forceFullSweep: false,
  };

  // see NavigationDisplayRenderer: two buffers so a transition never writes into the
  // frame it is reading from, and neither is reallocated every 40ms tick
  private transitionBuffers: [Uint8ClampedArray, Uint8ClampedArray] = [null, null];

  private acquireTransitionBuffer(length: number): Uint8ClampedArray {
    const free = this.transitionBuffers[0] === this.renderingData.lastFrame ? 1 : 0;
    if (this.transitionBuffers[free] === null || this.transitionBuffers[free].length !== length) {
      this.transitionBuffers[free] = new Uint8ClampedArray(length);
    }
    return this.transitionBuffers[free];
  }

  constructor(
    private readonly maphandler: MapHandler,
    private logging: Logger,
    private readonly gpu: GPU,
    private readonly startupTime: number,
  ) {
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
      waypointsLatitudes: [47.26081085205078],
      waypointsLongitudes: [11.349658966064453],
      range: 20.0,
      trackChangesSignificantlyAtDistance: -1,
    };

    this.startNewMapCycle(this.startupTime);

    return true;
  }

  public aircraftStatusUpdate(status: AircraftStatus, side: DisplaySide): void {
    this.elevationConfig.fmsPathUsed = !status.manualAzimEnabled && this.elevationConfig.waypointsLatitudes.length > 0;
    if (side === DisplaySide.Left) {
      const vdRange = status.efisDataCapt.arcMode
        ? Math.max(10, Math.min(status.efisDataCapt.ndRange, 160))
        : Math.max(5, Math.min(status.efisDataCapt.ndRange / 2, 160));
      this.elevationConfig.range = vdRange;
      this.displayConfig.range = status.efisDataCapt.ndRange;
      this.displayConfig.minimumAltitude = status.efisDataCapt.vdRangeLower;
      this.displayConfig.maximumAltitude = status.efisDataCapt.vdRangeUpper;
    } else {
      const vdRange = status.efisDataFO.arcMode
        ? Math.max(10, Math.min(status.efisDataFO.ndRange, 160))
        : Math.max(5, Math.min(status.efisDataFO.ndRange / 2, 160));
      this.elevationConfig.range = vdRange;
      this.displayConfig.range = status.efisDataFO.ndRange;
      this.displayConfig.minimumAltitude = status.efisDataFO.vdRangeLower;
      this.displayConfig.maximumAltitude = status.efisDataFO.vdRangeUpper;
    }
  }

  public pathDataUpdate(data: VerticalPathData): void {
    this.elevationConfig.pathWidth = data.pathWidth;
    this.elevationConfig.waypointsLatitudes = data.waypoints.map((wpts) => wpts.latitude);
    this.elevationConfig.waypointsLongitudes = data.waypoints.map((wpts) => wpts.longitude);
    this.elevationConfig.trackChangesSignificantlyAtDistance = data.trackChangesSignificantlyAtDistance;
  }

  public numPathElements(): number {
    return this.elevationConfig.waypointsLatitudes.length;
  }

  // immediate=true for a pilot-initiated change: see NavigationDisplayRenderer.reset()
  public reset(resetPath: boolean = false, immediate = false): void {
    this.renderingData = {
      startTransitionBorder: 0,
      currentTransitionBorder: 0,
      frameCounter: 0,
      finalFrame: null,
      lastFrame: null,
      currentFrame: null,
      forceFullSweep: immediate,
    };

    if (resetPath) {
      this.elevationConfig = {
        pathWidth: 1.0,
        waypointsLatitudes: [],
        waypointsLongitudes: [],
        range: 0.0,
        trackChangesSignificantlyAtDistance: -1,
      };
    }

    this.displayConfig = {
      range: 0.0,
      minimumAltitude: -500,
      maximumAltitude: 24000,
    };
  }

  public startNewMapCycle(currentTime: number): void {
    if (this.elevationConfig === null || this.elevationConfig.range === 0) {
      this.reset(true);
      return;
    }

    this.displayConfig.mapWidth = RenderingElevationProfileWidth;
    this.displayConfig.mapHeight = RenderingElevationProfileHeight;

    const profile = this.maphandler.createElevationProfile(this.elevationConfig, RenderingElevationProfileWidth);
    if (profile === null) return;

    const greyAreaStartsAtX =
      this.elevationConfig.trackChangesSignificantlyAtDistance >= 0 && this.elevationConfig.fmsPathUsed
        ? verticalDisplayDistanceToPixelX(
            this.elevationConfig.trackChangesSignificantlyAtDistance,
            this.elevationConfig.range,
          )
        : -1;

    let verticaldisplay: number[][];

    if (!GpuProcessingActive) {
      const extractData = (obj: any): any => {
        if (Array.isArray(obj)) return obj;
        if (typeof obj?.toArray === 'function') return obj.toArray();
        if (obj?.data) return obj.data;
        return obj;
      };
      const profileArr = extractData(profile) as number[];
      verticaldisplay = this.renderVerticalDisplayCPU(
        profileArr,
        this.displayConfig.minimumAltitude,
        this.displayConfig.maximumAltitude,
        greyAreaStartsAtX,
      );
    } else {
      verticaldisplay = this.renderer(
        profile,
        this.displayConfig.minimumAltitude,
        this.displayConfig.maximumAltitude,
        greyAreaStartsAtX,
      ) as number[][];
      // some GPU drivers require the flush call to release internal memory
      if (this.renderer.context) this.renderer.context.flush();
    }

    // row-by-row into a reused buffer — see NavigationDisplayRenderer.startNewMapCycle
    const frameWidth = verticaldisplay[0].length;
    const frameLength = verticaldisplay.length * frameWidth;
    if (this.renderingData.finalFrame === null || this.renderingData.finalFrame.length !== frameLength) {
      this.renderingData.finalFrame = new Uint8ClampedArray(frameLength);
    }
    for (let y = 0; y < verticaldisplay.length; ++y) {
      this.renderingData.finalFrame.set(verticaldisplay[y], y * frameWidth);
    }

    if (this.renderingData.lastFrame === null && !this.renderingData.forceFullSweep) {
      const timeSinceStart = currentTime - this.startupTime;
      const frameUpdateCount = timeSinceStart / RenderingMapFrameValidityTimeScanlineMode;
      const ratioSinceLastFrame = frameUpdateCount - Math.floor(frameUpdateCount);

      this.renderingData.startTransitionBorder = Math.floor(RenderingElevationProfileWidth * ratioSinceLastFrame);
    } else {
      this.renderingData.startTransitionBorder = 0;
    }

    this.renderingData.currentTransitionBorder = this.renderingData.startTransitionBorder;
    this.renderingData.forceFullSweep = false;
  }

  private renderVerticalDisplayCPU(
    elevationProfile: number[],
    minimumAltitude: number,
    maximumAltitude: number,
    greyBackgroundFromX: number,
  ): number[][] {
    const width = RenderingElevationProfileWidth;
    const height = RenderingElevationProfileHeight;
    const stepY = (maximumAltitude - minimumAltitude) / height;
    const output: number[][] = new Array(height);

    for (let y = 0; y < height; y++) {
      const row = new Array(width * RenderingColorChannelCount);
      const altitude = (height - y) * stepY + minimumAltitude;

      for (let pixelX = 0; pixelX < width; pixelX++) {
        const elevation = elevationProfile[pixelX];

        let r: number, g: number, b: number, a: number;
        if (elevation === InvalidElevation || elevation === UnknownElevation) {
          r = 0;
          g = 0;
          b = 0;
          a = 0;
        } else if (altitude > elevation) {
          if (greyBackgroundFromX >= 0 && pixelX >= greyBackgroundFromX) {
            r = 78;
            g = 78;
            b = 97;
            a = 255;
          } else {
            r = 0;
            g = 0;
            b = 0;
            a = 0;
          }
        } else if (elevation === WaterElevation) {
          if (altitude <= 0) {
            r = 0;
            g = 255;
            b = 255;
            a = 255;
          } else {
            r = 0;
            g = 0;
            b = 0;
            a = 0;
          }
        } else {
          r = 110;
          g = 51;
          b = 14;
          a = 255;
        }

        const baseX = pixelX * RenderingColorChannelCount;
        row[baseX] = r;
        row[baseX + 1] = g;
        row[baseX + 2] = b;
        row[baseX + 3] = a;
      }
      output[y] = row;
    }
    return output;
  }

  private transitionFrame(oldFrame: Uint8ClampedArray, newFrame: Uint8ClampedArray): Uint8ClampedArray {
    if (newFrame === null) return null;

    const result = this.acquireTransitionBuffer(
      RenderingElevationProfileWidth * RenderingColorChannelCount * RenderingElevationProfileHeight,
    );

    // access data as uint32-array due to performance reasons
    const destination = new Uint32Array(result.buffer);
    // UInt32-version of RGBA (4, 4, 4, 0)
    destination.fill(263172);
    const oldSource = oldFrame !== null ? new Uint32Array(oldFrame.buffer) : null;
    const newSource = new Uint32Array(newFrame.buffer);

    let arrayIndex = 0;
    for (let y = 0; y < RenderingElevationProfileHeight; ++y) {
      for (let x = 0; x < RenderingElevationProfileWidth; ++x) {
        if (x >= this.renderingData.startTransitionBorder && x <= this.renderingData.currentTransitionBorder) {
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
    // nothing to do here
    if (this.renderingData.finalFrame === null) return true;

    const horizontalStep = Math.round(
      (RenderingElevationProfileWidth / RenderingMapTransitionDurationScanlineMode) * RenderingMapTransitionDeltaTime,
    );
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
