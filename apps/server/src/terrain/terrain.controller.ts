import { Controller, Get, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';
import { TerrainmapInfo } from './dto/terrainmapinfo.dto';

@ApiTags('TERRAIN')
@Controller('api/v1/terrain')
export class TerrainController {
    constructor(private terrainService: TerrainService) {}

    @Get('exists')
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

    @Get('mapinfo')
    @ApiResponse({
        status: 200,
        description: 'the terrainmap information',
        type: TerrainmapInfo,
    })
    @ApiResponse({
        status: 404,
        description: 'unable to find the terrainmap information',
    })
    async getTerrainmapInfo(): Promise<TerrainmapInfo> {
        return this.terrainService.Terrainmap.then((map) => {
            const retval = new TerrainmapInfo();

            if (map !== undefined) {
                retval.mostNorth = map.LatitudeRange[1];
                retval.mostSouth = map.LatitudeRange[0];
                retval.mostWest = map.LongitudeRange[0];
                retval.mostEast = map.LongitudeRange[1];
                retval.latitudinalStep = map.AngularSteps[0];
                retval.longitudinalStep = map.AngularSteps[1];
                retval.elevationResolution = map.ElevationResolution;
            }

            return retval;
        });
    }
}
