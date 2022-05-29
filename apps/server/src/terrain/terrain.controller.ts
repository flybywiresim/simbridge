import { Controller, Get, Patch, Body, BadRequestException, NotFoundException, Put, Res, Query, HttpStatus, HttpException } from '@nestjs/common';
import { ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';
import { ConfigurationDto } from './dto/configuration.dto';
import { PositionDto } from './dto/position.dto';
import { NDViewDto } from './dto/ndview.dto';
import { NDTerrainDataDto } from './dto/ndterraindata.dto';

@ApiTags('TERRAIN')
@Controller('api/v1/terrain')
export class TerrainController {
    private presentHeading: number = 0;

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
        if (this.terrainService.Terrainmap === undefined || this.terrainService.MapManager === undefined) {
            throw new NotFoundException('Terrainmap not loaded');
        }
    }

    @Put('configureDisplay')
    @ApiBody({
        description: 'The new connection containing the flight number and current location',
        type: NDViewDto,
    })
    @ApiResponse({
        status: 200,
        description: 'Updated the ND display configuration',
    })
    @ApiResponse({
        status: 400,
        description: 'Unable to update the display configuration',
    })
    configureDisplay(@Body() config: NDViewDto): void {
        if (this.terrainService.MapManager === undefined) {
            throw new BadRequestException('Unable to configure the ND display');
        }
        this.terrainService.MapManager.configureNd(config);
    }

    @Patch('configure')
    @ApiBody({
        description: 'The configuration entry',
        type: ConfigurationDto,
    })
    @ApiResponse({
        status: 200,
        description: 'Configured the system',
    })
    @ApiResponse({
        status: 400,
        description: 'Unable to configure the system',
    })
    configure(@Body() config: ConfigurationDto) {
        if (this.terrainService.configure(config) === false) {
            throw new BadRequestException('Unable to configure the terrain service');
        }
    }

    @Patch('position')
    @ApiBody({
        description: 'The current position',
        type: PositionDto,
    })
    @ApiResponse({
        status: 200,
        description: 'Current position updated',
    })
    positionUpdate(@Body() position: PositionDto) {
        this.terrainService.updatePosition(position);
        this.presentHeading = position.heading;
    }

    private streamNdMap(display: string, response): void {
        const { buffer, rows, columns } = this.terrainService.MapManager.ndMap(display);
        if (rows !== 0 && columns !== 0) {
            response.set({ 'Content-Type': 'image/png' });
            response.end(buffer);
        }
    }

    @Get('left.png')
    async getLeftNdMap(@Res({ passthrough: true }) response) {
        return this.streamNdMap('L', response);
    }

    @Get('right.png')
    async getRightNdMap(@Res({ passthrough: true }) response) {
        return this.streamNdMap('R', response);
    }

    @Get('terrainRange')
    @ApiResponse({
        status: 200,
        description: 'The ND terrain data information',
        type: NDTerrainDataDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid display settings set',
    })
    getTerrainRange(@Query() query) {
        if (!('display' in query) || (query.display !== 'L' && query.display !== 'R')) {
            throw new HttpException('Invalid display setting', HttpStatus.BAD_REQUEST);
        }

        const ndMap = this.terrainService.MapManager.ndMap(query.display);
        const retval = new NDTerrainDataDto();
        retval.minElevation = Math.round(ndMap.minElevation);
        retval.maxElevation = Math.round(ndMap.maxElevation);

        return retval;
    }
}
