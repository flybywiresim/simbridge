import { Controller, Get, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';

@ApiTags('TERRAIN')
@Controller('api/v1/terrain')
export class TerrainController {
    constructor(private terrainService: TerrainService) {}
}
