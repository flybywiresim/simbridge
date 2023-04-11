import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { NavigationDisplayThresholdsDto } from './dto/navigationdisplaythresholds.dto';

@Injectable()
export class TerrainService implements OnApplicationShutdown {
    private readonly logger = new Logger(TerrainService.name);

    private mapHandler: Worker = null;

    private frameDataCallbacks: ((side: string, data: { timestamp: number, frames: Uint8ClampedArray[], thresholds: NavigationDisplayThresholdsDto }) => boolean)[] = [];

    constructor() {
        this.mapHandler = new Worker(path.resolve(__dirname, './processing/maphandler.js'));
        this.mapHandler.on('message', (data: { request: string, content: any, error: any }) => {
            if (data.request === 'RES_FRAME_DATA') {
                const response = data.content as { side: string, timestamp: number, thresholds: NavigationDisplayThresholdsDto, frames: Uint8ClampedArray[] };

                this.frameDataCallbacks.every((callback, index) => {
                    if (callback(response.side, response)) {
                        this.frameDataCallbacks.splice(index, 1);
                        return false;
                    }
                    return true;
                });
            } else if (data.request === 'LOGINFO') {
                this.logger.log(data.content);
            } else if (data.request === 'LOGWARN') {
                this.logger.warn(data.content);
            } else if (data.request === 'LOGERROR') {
                this.logger.error(data.content, data.error);
            }
        });
    }

    onApplicationShutdown(_signal?: string) {
        this.logger.log(`Destroying ${TerrainService.name}`);
        if (this.mapHandler) {
            this.mapHandler.postMessage({ request: 'REQ_SHUTDOWN', content: undefined });
            this.mapHandler.terminate();
            this.mapHandler = null;
        }
    }

    public async frameData(display: string): Promise<{ timestamp: number, frames: Uint8ClampedArray[], thresholds: NavigationDisplayThresholdsDto }> {
        if (!this.mapHandler) return undefined;

        return new Promise<{ timestamp: number, frames: Uint8ClampedArray[], thresholds: NavigationDisplayThresholdsDto }>((resolve, _reject) => {
            this.frameDataCallbacks.push((side, data) => {
                if (side === display) resolve(data);
                return side === display;
            });
            this.mapHandler.postMessage({ request: 'REQ_FRAME_DATA', content: display });
        });
    }
}
