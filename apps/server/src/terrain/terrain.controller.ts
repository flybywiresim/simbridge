import { Controller, Get, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';

@ApiTags('TERRAIN')
@Controller('api/v1/terrain')
export class TerrainController {
    constructor(private terrainService: TerrainService) {}

    @Get('terrainmapExists')
    @ApiResponse({
        status: 200,
        description: 'the terrainmap data exists',
        type: Boolean,
    })
    @ApiResponse({
        status: 404,
        description: 'unable to find the terrainmap data',
    })
    async getTerrainmapExists(): Promise<Boolean> {
        return this.terrainService.terrainmapExists();
    }
}
