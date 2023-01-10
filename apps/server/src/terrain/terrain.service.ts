import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { FileService } from '../utilities/file.service';
import { NavigationDisplayThresholdsDto } from './dto/navigationdisplaythresholds.dto';
import { TerrainMap } from './fileformat/terrainmap';

@Injectable()
export class TerrainService implements OnApplicationShutdown {
    private readonly logger = new Logger(TerrainService.name);

    private mapHandlerReady: boolean = false;

    private mapHandler: Worker = null;

    private terrainDirectory = 'terrain/';

    private frameDataTimestampCallbacks: { [side: string]: { callback: (timestamp: number) => void } } = {
        L: { callback: null },
        R: { callback: null },
    };

    private frameDataThresholdsCallbacks: { [side: string]: { callback: (thresholds: NavigationDisplayThresholdsDto) => void } } = {
        L: { callback: null },
        R: { callback: null },
    };

    private frameDataCallbacks: { [side: string]: { callback: (data: { timestamp: number, frames: Uint8ClampedArray[] }) => void } } = {
        L: { callback: null },
        R: { callback: null },
    };

    constructor(private fileService: FileService) {
        this.mapHandler = new Worker(path.resolve(__dirname, './processing/maphandler.js'));
        this.mapHandler.on('message', (message: { request: string, response: any }) => {
            if (message.request === 'INITIALIZATION') {
                this.mapHandlerReady = message.response as boolean;
                if (this.mapHandlerReady) {
                    this.logger.log('Initialized map management');
                } else {
                    this.logger.log('Unable to initialize the map handler');
                }
            } else if (message.request === 'LOGMESSAGE') {
                this.logger.log(message.response as string);
            } else if (message.request === 'LOGWARN') {
                this.logger.warn(message.response as string);
            } else if (message.request === 'LOGERROR') {
                this.logger.error(message.response as string);
            } else if (message.request === 'FRAME_DATA_TIMESTAMP') {
                const response = message.response as { side: string; timestamp: number };
                if (this.frameDataTimestampCallbacks[response.side].callback !== null) {
                    this.frameDataTimestampCallbacks[response.side].callback(response.timestamp);
                }
            } else if (message.request === 'FRAME_DATA_THRESHOLDS') {
                const response = message.response as { side: string; thresholds: NavigationDisplayThresholdsDto };
                if (this.frameDataThresholdsCallbacks[response.side].callback !== null) {
                    this.frameDataThresholdsCallbacks[response.side].callback(response.thresholds);
                }
            } else if (message.request === 'FRAME_DATA') {
                const response = message.response as { side: string; data: { timestamp: number, frames: Uint8ClampedArray[] } };
                if (this.frameDataCallbacks[response.side].callback !== null) {
                    this.frameDataCallbacks[response.side].callback(response.data);
                }
            } else if (message.request === 'SHUTDOWN') {
                this.mapHandler.terminate();
            }
        });

        this.readTerrainMap().then((map) => {
            this.mapHandler.postMessage({ type: 'INITIALIZATION', instance: map });
        });
    }

    onApplicationShutdown(_signal?: string) {
        this.mapHandler.postMessage({ type: 'SHUTDOWN' });
    }

    private async readTerrainMap(): Promise<TerrainMap | undefined> {
        try {
            const buffer = await this.fileService.getFile(
                this.terrainDirectory,
                'terrain.map',
            );
            this.logger.log(`Read MB of terrainmap: ${(Buffer.byteLength(buffer) / (1024 * 1024)).toFixed(2)}`);

            return new TerrainMap(buffer);
        } catch (err) {
            this.logger.warn('Did not find the terrain.map-file');
            this.logger.warn(err);
            return undefined;
        }
    }

    public async frameDataTimestamp(display: string): Promise<number> {
        return new Promise<number>((resolve, _reject) => {
            this.mapHandler.postMessage({ type: 'FRAME_DATA_TIMESTAMP', instance: display });
            this.frameDataTimestampCallbacks[display].callback = (timestamp: number) => {
                this.frameDataTimestampCallbacks[display] = null;
                resolve(timestamp);
            };
        });
    }

    public async frameDataThresholds(display: string): Promise<NavigationDisplayThresholdsDto> {
        return new Promise<NavigationDisplayThresholdsDto>((resolve, _reject) => {
            this.mapHandler.postMessage({ type: 'FRAME_DATA_THRESHOLDS', instance: display });
            this.frameDataThresholdsCallbacks[display].callback = (thresholds: NavigationDisplayThresholdsDto) => {
                this.frameDataThresholdsCallbacks[display] = null;
                resolve(thresholds);
            };
        });
    }

    public async frameData(display: string): Promise<{ timestamp: number, frames: Uint8ClampedArray[] }> {
        return new Promise<{ timestamp: number, frames: Uint8ClampedArray[] }>((resolve, _reject) => {
            this.mapHandler.postMessage({ type: 'FRAME_DATA', instance: display });
            this.frameDataCallbacks[display].callback = (data: { timestamp: number, frames: Uint8ClampedArray[] }) => {
                this.frameDataCallbacks[display] = null;
                resolve(data);
            };
        });
    }
}
