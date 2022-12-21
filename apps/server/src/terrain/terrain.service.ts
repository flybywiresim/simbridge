import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { FileService } from '../utilities/file.service';
import { PositionData } from './communication/types';
import { NavigationDisplayViewDto } from './dto/navigationdisplayview.dto';
import { TerrainMap } from './fileformat/terrainmap';

@Injectable()
export class TerrainService implements OnApplicationShutdown {
    private readonly logger = new Logger(TerrainService.name);

    private a32nxMapHandlerReady: boolean = false;

    private a32nxMapHandler: Worker = null;

    private terrainDirectory = 'terrain/';

    constructor(private fileService: FileService) {
        this.a32nxMapHandler = new Worker(path.resolve(__dirname, './processing/maphandler.js'));
        this.a32nxMapHandler.on('message', (message: { request: string, response: any }) => {
            if (message.request === 'INITIALIZATION') {
                this.a32nxMapHandlerReady = message.response as boolean;
                if (this.a32nxMapHandlerReady) {
                    this.logger.log('Initialized map management');
                } else {
                    this.logger.log('Unable to initialize the map handler');
                }
            } else if (message.request === 'SIMOBJECT_POSITION') {
                this.updatePosition(message.response as PositionData);
            } else if (message.request === 'LOGMESSAGE') {
                this.logger.log(message.response as string);
            } else if (message.request === 'LOGWARN') {
                this.logger.warn(message.response as string);
            } else if (message.request === 'LOGERROR') {
                this.logger.error(message.response as string);
            } else if (message.request === 'SHUTDOWN') {
                this.a32nxMapHandler.terminate();
            }
        });

        this.readTerrainMap().then((map) => {
            this.a32nxMapHandler.postMessage({ type: 'INITIALIZATION', instance: { aircraft: 'A32NX', map } });
        });
    }

    onApplicationShutdown(_signal?: string) {
        this.a32nxMapHandler.postMessage({ type: 'SHUTDOWN' });
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

    private updatePosition(position: PositionData): void {
        if (this.a32nxMapHandlerReady) {
            this.a32nxMapHandler.postMessage({ type: 'POSITION', instance: position });
        }
    }

    public configureNavigationDisplay(side: string, config: NavigationDisplayViewDto): void {
        if (this.a32nxMapHandlerReady) {
            this.a32nxMapHandler.postMessage({
                type: 'NDCONFIGURATION',
                instance: {
                    side,
                    config,
                },
            });
        }
    }
}
