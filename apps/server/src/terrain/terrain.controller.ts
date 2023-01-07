import { Controller, Get } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';

@ApiTags('TERRAIN')
@Controller('api/v1/terrain')
export class TerrainController {
    constructor(private terrainService: TerrainService) {}

    @Get('available')
    @ApiResponse({
        status: 200,
        description: 'The terrainmap is available',
    })
    @ApiResponse({
        status: 404,
        description: 'The terrainmap is not loaded',
    })
    mapAvailable() {
        // if (this.terrainService.Terrainmap === undefined || this.terrainService.MapManager === undefined) {
        //     throw new NotFoundException('System not initialized');
        // }
    }
}
