import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { NavigationDisplayThresholdsDto } from './dto/navigationdisplaythresholds.dto';
import { DisplaySide, MainToWorkerThreadMessageTypes, WorkerToMainThreadMessage, WorkerToMainThreadMessageTypes } from './types';
import { ElevationSamplePathDto } from './dto/elevationsamplepath.dto';

@Injectable()
export class TerrainService implements OnApplicationShutdown {
    private readonly logger = new Logger(TerrainService.name);

    private mapHandler: Worker = null;

    private frameDataCallbacks: ((side: DisplaySide, data: { timestamp: number, frames: Uint8ClampedArray[], thresholds: NavigationDisplayThresholdsDto }) => boolean)[] = [];

    constructor() {
        this.mapHandler = new Worker(path.resolve(__dirname, './processing/maphandler.js'));
        this.mapHandler.on('message', (data: WorkerToMainThreadMessage) => {
            if (data.type === WorkerToMainThreadMessageTypes.FrameData) {
                const response = data.content as { side: DisplaySide, timestamp: number, thresholds: NavigationDisplayThresholdsDto, frames: Uint8ClampedArray[] };

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

    onApplicationShutdown(_signal?: string) {
        this.logger.log(`Destroying ${TerrainService.name}`);
        if (this.mapHandler) {
            this.mapHandler.postMessage({ type: MainToWorkerThreadMessageTypes.Shutdown });
            this.mapHandler.terminate();
            this.mapHandler = null;
        }
    }

    public async frameData(display: DisplaySide): Promise<{ timestamp: number, frames: Uint8ClampedArray[], thresholds: NavigationDisplayThresholdsDto }> {
        if (!this.mapHandler) return undefined;

        return new Promise<{ timestamp: number, frames: Uint8ClampedArray[], thresholds: NavigationDisplayThresholdsDto }>((resolve, _reject) => {
            this.frameDataCallbacks.push((side, data) => {
                if (side === display) resolve(data);
                return side === display;
            });
            this.mapHandler.postMessage({ type: MainToWorkerThreadMessageTypes.FrameData, content: display });
        });
    }

    public updateFlightPath(display: DisplaySide, path: ElevationSamplePathDto): void {
        if (this.mapHandler) {
            this.mapHandler.postMessage({
                type: MainToWorkerThreadMessageTypes.VerticalDisplayPath,
                content: path,
            });
        }
    }
}
