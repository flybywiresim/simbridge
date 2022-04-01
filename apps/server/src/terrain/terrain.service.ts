import { Injectable, Logger } from '@nestjs/common';
import { FileService } from '../utilities/file.service';
import { Terrainmap } from './mapformat/terrainmap';

@Injectable()
export class TerrainService {
    constructor(private fileService: FileService) {}

    private readonly logger = new Logger(TerrainService.name);

    private terrainDirectory = 'resources/terrain/';

    private terrainmap = this.readTerrainmap();

    async readTerrainmap(): Promise<Terrainmap | undefined> {
        try {
            const buffer = await this.fileService.getFile(
                this.terrainDirectory,
                `terrain.map`,
            );
            this.logger.log(`Read MB of terrainmap: ${Buffer.byteLength(buffer) / (1024 * 1024)}`);

            return new Terrainmap(buffer);
        }
        catch (err) {
            this.logger.warn('Did not find the terrain.map-file');
            return undefined;
        }
    }

    async terrainmapExists(): Promise<boolean> {
        return this.terrainmap.then((map) => map !== undefined);
    }
}
