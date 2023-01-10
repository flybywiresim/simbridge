import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { FileService } from '../utilities/file.service';
import { TerrainMap } from './fileformat/terrainmap';

@Injectable()
export class TerrainService implements OnApplicationShutdown {
    private readonly logger = new Logger(TerrainService.name);

    private mapHandlerReady: boolean = false;

    private mapHandler: Worker = null;

    private terrainDirectory = 'terrain/';

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
}
