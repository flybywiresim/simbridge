import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { NavigationDisplayThresholdsDto } from './dto/navigationdisplaythresholds.dto';
import { NestLogger } from './processing/logging/nestlogger';
import { MapHandler } from './processing/maphandler';

@Injectable()
export class TerrainService implements OnApplicationShutdown {
    private readonly logger = new Logger(TerrainService.name);

    private mapHandler: MapHandler = null;

    constructor() {
        this.mapHandler = new MapHandler(new NestLogger(this.logger));
    }

    onApplicationShutdown(_signal?: string) {
        this.mapHandler.shutdown();
    }

    public frameData(display: string): { timestamp: number, frames: Uint8ClampedArray[], thresholds: NavigationDisplayThresholdsDto } {
        return this.mapHandler.frameData(display);
    }
}
