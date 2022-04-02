import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';
import { Configuration } from './dto/configuration.dto';
import { Position } from './dto/position.dto';
import { TerrainmapInfo } from './dto/terrainmapinfo.dto';

const sharp = require('sharp');

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
        const retval = new TerrainmapInfo();

        if (this.terrainService.Terrainmap !== undefined) {
            retval.mostNorth = this.terrainService.Terrainmap.LatitudeRange.max;
            retval.mostSouth = this.terrainService.Terrainmap.LatitudeRange.min;
            retval.mostWest = this.terrainService.Terrainmap.LongitudeRange.min;
            retval.mostEast = this.terrainService.Terrainmap.LongitudeRange.max;
            retval.latitudinalStep = this.terrainService.Terrainmap.AngularSteps.latitude;
            retval.longitudinalStep = this.terrainService.Terrainmap.AngularSteps.longitude;
            retval.elevationResolution = this.terrainService.Terrainmap.ElevationResolution;
        }

        return retval;
    }

    @Post('configure')
    @ApiResponse({
        status: 200,
        description: 'Configured the system',
    })
    configure(@Query('config') config: Configuration) {
        this.terrainService.configure(config);
    }

    @Post('position')
    @ApiResponse({
        status: 200,
        description: 'Current position updated',
    })
    positionUpdate(@Query('position') position: Position) {
        this.terrainService.updatePosition(position);
    }

    @Get('tile')
    @ApiResponse({
        status: 200,
        description: 'The elevation grid of a tile',
        type: Buffer,
    })
    @ApiResponse({
        status: 404,
        description: 'Unable to find the tile',
    })
    @ApiProduces('image/png')
    async getTile(@Query('lat') latStr: string, @Query('lon') lonStr: string) {
        const map = this.terrainService.Terrainmap;

        if (map !== undefined) {
            const lat = parseInt(latStr);
            const lon = parseInt(lonStr);

            for (let i = 0; i < map.Tiles.length; ++i) {
                if (map.Tiles[i].Southwest.latitude === lat && map.Tiles[i].Southwest.longitude === lon) {
                    const grid = map.Tiles[i].elevationGrid();
                    const pixelBuffer = Buffer.from([].concat(...grid.Grid));

                    const pngBuffer = await sharp(pixelBuffer, { raw: { width: grid.Columns, height: grid.Rows, channels: 1 } })
                        .toFormat('png')
                        .toBuffer();
                    sharp(pngBuffer).toFile('./test.png');

                    return pngBuffer;
                }
            }
        }

        return undefined;
    }
}
