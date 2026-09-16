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

  // guards against a respawn storm if the worker keeps crashing immediately on startup
  private restartCount = 0;

  private shuttingDown = false;

  constructor() {
    this.spawnWorker();
  }

  private spawnWorker(): void {
    this.terrainWorker = new Worker(path.resolve(__dirname, './processing/terrainworker.js'));
    this.attachWorkerHandlers(this.terrainWorker);
  }

  private attachWorkerHandlers(worker: Worker): void {
    // Node.js Worker instances are EventEmitters: an uncaught exception inside the worker
    // thread is surfaced as an 'error' event. If no 'error' listener is attached, Node re-throws it
    // on the MAIN thread, which crashes the entire SimBridge process.
    // Attaching a listener here prevents that crash; instead we log it and respawn the
    // worker so terrain rendering recovers on its own.
    worker.on('error', (err) => {
      this.logger.error(`Terrain worker crashed: ${err?.stack ?? err}`);
      this.respawnAfterCrash();
    });

    worker.on('exit', (code) => {
      if (this.shuttingDown) {
        return;
      }
      if (code !== 0) {
        this.logger.error(`Terrain worker exited unexpectedly with code ${code}`);
        this.respawnAfterCrash();
      }
    });

    worker.on('message', (data: WorkerToMainThreadMessage) => {
      if (data.type === WorkerToMainThreadMessageTypes.FrameData) {
        const response = data.content as {
          side: DisplaySide;
          timestamp: number;
          thresholds: NavigationDisplayThresholdsDto;
          frames: Uint8ClampedArray[];
        };

        this.frameDataCallbacks.every((callback, index) => {
          if (callback(response.side, response)) {
            this.frameDataCallbacks.splice(index, 1);
            return false;
          }
          return true;
        });
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
  }

  private respawnAfterCrash(): void {
    if (this.shuttingDown) {
      return;
    }

    this.frameDataCallbacks = [];
    this.terrainWorker = null;

    // avoid a tight respawn loop if the worker is crashing immediately on every startup
    // (e.g. a persistently broken GPU driver) - cap restarts and back off
    this.restartCount += 1;
    if (this.restartCount > 5) {
      this.logger.error('Terrain worker has crashed repeatedly, giving up on automatic restarts');
      return;
    }

    const delayMs = Math.min(1000 * 2 ** (this.restartCount - 1), 30000);
    this.logger.warn(`Restarting terrain worker in ${delayMs}ms (attempt ${this.restartCount})`);
    setTimeout(() => {
      if (!this.shuttingDown) {
        this.spawnWorker();
      }
    }, delayMs);
  }

  onApplicationShutdown(_signal?: string) {
    this.logger.log(`Destroying ${TerrainService.name}`);
    this.shuttingDown = true;
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
      (resolve, _reject) => {
        this.frameDataCallbacks.push((side, data) => {
          if (side === display) resolve(data);
          return side === display;
        });
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
