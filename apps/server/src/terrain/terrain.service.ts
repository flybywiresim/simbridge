import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { FileService } from '../utilities/file.service';
import { NavigationDisplayViewDto } from './dto/navigationdisplayview.dto';
import { PositionDto } from './dto/position.dto';
import { TerrainMap } from './mapformat/terrainmap';

@Injectable()
export class TerrainService implements OnApplicationShutdown {
    private readonly logger = new Logger(TerrainService.name);

    private mapHandlerReady: boolean = false;

    private mapHandler: Worker = null;

    private terrainDirectory = 'terrain/';

    constructor(private fileService: FileService) {
        this.mapHandler = new Worker(path.resolve(__dirname, './utils/maphandler.js'));

        this.readTerrainMap().then((map) => {
            this.mapHandler.on('message', () => {
                this.logger.log('Initialized map management');
                // TODO add a callback function to handle the created data
                this.mapHandlerReady = true;
            });
            this.mapHandler.postMessage({ type: 'INITIALIZATION', instance: map });
        });
    }

    onApplicationShutdown(_signal?: string) {
        this.mapHandler.postMessage({ type: 'SHUTDOWN' });
        this.mapHandler.on('message', () => this.mapHandler.terminate());
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

    public updatePosition(position: PositionDto): void {
        if (this.mapHandlerReady) {
            this.mapHandler.postMessage({ type: 'POSITION', instance: position });
        }
    }

    public configureNavigationDisplay(side: string, config: NavigationDisplayViewDto): void {
        if (this.mapHandlerReady) {
            this.mapHandler.postMessage({
                type: 'NDCONFIGURATION',
                instance: {
                    side,
                    config,
                },
            });
        }
    }

    public renderNavigationDisplay(side: string): void {
        if (this.mapHandlerReady) {
            this.mapHandler.postMessage({ type: 'NDRENDER', instance: side });
        }
    }
}
