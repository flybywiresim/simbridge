import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { NavigationDisplayThresholdsDto } from './dto/navigationdisplaythresholds.dto';
import {
  DisplaySide,
  MainToWorkerThreadMessageTypes,
  VerticalPathData,
  WorkerToMainThreadMessage,
  WorkerToMainThreadMessageTypes,
} from './types';
import { ElevationSamplePathDto } from './dto/elevationsamplepath.dto';
import { TawsAircraftStatusDataDto } from 'apps/server/src/terrain/dto/tawsaircraftstatusdata.dto';

@Injectable()
export class TerrainService implements OnApplicationShutdown {
  private readonly logger = new Logger(TerrainService.name);

  private terrainWorker: Worker = null;

  private frameDataCallbacks: ((
    side: DisplaySide,
    data: { timestamp: number; frames: Uint8ClampedArray[]; thresholds: NavigationDisplayThresholdsDto },
  ) => boolean)[] = [];

  constructor() {
    this.terrainWorker = new Worker(path.resolve(__dirname, './processing/terrainworker.js'));
    this.terrainWorker.on('message', (data: WorkerToMainThreadMessage) => {
      if (data.type === WorkerToMainThreadMessageTypes.FrameData) {
        const response = data.content as {
          side: DisplaySide;
          timestamp: number;
          thresholds: NavigationDisplayThresholdsDto;
          frames: Uint8ClampedArray[];
        };

        this.frameDataCallbacks = this.frameDataCallbacks.filter(
          (callback) => !callback(response.side, response),
        );
      } else if (data.type === WorkerToMainThreadMessageTypes.LogInfo) {
        this.logger.log(data.content);
      } else if (data.type === WorkerToMainThreadMessageTypes.LogWarn) {
        this.logger.warn(data.content);
      } else if (data.type === WorkerToMainThreadMessageTypes.LogError) {
        this.logger.error(data.content);
      } else {
        this.logger.error(`Unknown type: ${data.type} - ${data.content}`);
      }
    });
    this.terrainWorker.on('error', (err) => {
      this.logger.error(`Terrain worker crashed: ${err.message}`);
      this.frameDataCallbacks = [];
      this.terrainWorker = null;
    });
  }

  onApplicationShutdown(_signal?: string) {
    this.logger.log(`Destroying ${TerrainService.name}`);
    if (this.terrainWorker) {
      this.terrainWorker.postMessage({ type: MainToWorkerThreadMessageTypes.Shutdown });
      this.terrainWorker.terminate();
      this.terrainWorker = null;
    }
  }

  public async frameData(
    display: DisplaySide,
  ): Promise<{ timestamp: number; frames: Uint8ClampedArray[]; thresholds: NavigationDisplayThresholdsDto }> {
    if (!this.terrainWorker) return undefined;

    return new Promise<{ timestamp: number; frames: Uint8ClampedArray[]; thresholds: NavigationDisplayThresholdsDto }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          this.frameDataCallbacks = this.frameDataCallbacks.filter(
            (cb) => cb !== callback,
          );
          reject(new Error('Terrain worker frame data timeout'));
        }, 5000);

        const callback = (side: DisplaySide, data: { timestamp: number; frames: Uint8ClampedArray[]; thresholds: NavigationDisplayThresholdsDto }) => {
          if (side === display) {
            clearTimeout(timeout);
            resolve(data);
            return true;
          }
          return false;
        };
        this.frameDataCallbacks.push(callback);
        this.terrainWorker.postMessage({ type: MainToWorkerThreadMessageTypes.FrameData, content: display });
      },
    );
  }

  public updateAircraftStatusData(aircraftStatusData: TawsAircraftStatusDataDto): void {
    if (this.terrainWorker) {
      this.terrainWorker.postMessage({
        type: MainToWorkerThreadMessageTypes.AircraftStatusData,
        content: aircraftStatusData,
      });
    }
  }

  public updateFlightPath(path: ElevationSamplePathDto): void {
    if (this.terrainWorker) {
      const content: VerticalPathData = {
        pathWidth: path.pathWidth,
        trackChangesSignificantlyAtDistance: path.trackChangesSignificantlyAtDistance,
        waypoints: path.waypoints,
      };
      this.terrainWorker.postMessage({
        type: MainToWorkerThreadMessageTypes.VerticalDisplayPath,
        content: content,
      });
    }
  }
}
