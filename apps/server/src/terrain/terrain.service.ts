import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { FileService } from '../utilities/file.service';
import { TerrainMap } from './mapformat/terrainmap';
import { Worldmap } from './manager/worldmap';
import { PositionDto } from './dto/position.dto';

@Injectable()
export class TerrainService implements OnApplicationShutdown {
    private readonly logger = new Logger(TerrainService.name);

    private terrainDirectory = 'terrain/';

    public Terrainmap: TerrainMap | undefined = undefined;

    public MapManager: Worldmap | undefined = undefined;

    constructor(private fileService: FileService) {
        this.readTerrainMap().then((map) => {
            this.Terrainmap = map;
            if (map !== undefined) {
                this.MapManager = new Worldmap(this.Terrainmap);
            }
        });
    }

    onApplicationShutdown(_signal?: string) {
        if (this.MapManager !== undefined) {
            this.MapManager.shutdown();
        }
    }

    private async readTerrainMap(): Promise<TerrainMap | undefined> {
        try {
            const buffer = await this.fileService.getFile(
                this.terrainDirectory,
                'terrain.map',
            );
            this.logger.log(`Read MB of terrainmap: ${Buffer.byteLength(buffer) / (1024 * 1024)}`);

            return new TerrainMap(buffer);
        } catch (err) {
            this.logger.warn('Did not find the terrain.map-file');
            this.logger.warn(err);
            return undefined;
        }
    }

    public updatePosition(position: PositionDto): void {
        if (this.MapManager !== undefined) {
            this.MapManager.updatePosition(position);
        }
    }
}
