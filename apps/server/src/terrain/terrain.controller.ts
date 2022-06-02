import { Controller, Get, Patch, Body, BadRequestException, NotFoundException, Put, Res, Query, HttpStatus, HttpException } from '@nestjs/common';
import { ApiResponse, ApiTags, ApiBody, ApiQuery } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';
import { PositionDto } from './dto/position.dto';
import { NDViewDto } from './dto/ndview.dto';
import { NDTerrainDataDto } from './dto/ndterraindata.dto';
import { TerrainLevelMode } from './manager/nddata';

enum DisplaySide {
    Left = 'L',
    Right = 'R',
}

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
        if (this.terrainService.Terrainmap === undefined || this.terrainService.MapManager === undefined) {
            throw new NotFoundException('Terrainmap not loaded');
        }
    }

    @Put('displaysettings')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
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
    configureDisplay(@Query('display') display, @Body() config: NDViewDto): void {
        if (this.terrainService.MapManager === undefined) {
            throw new BadRequestException('Unable to configure the ND display');
        }
        this.terrainService.MapManager.configureNd(display, config);
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
        position.heading = Math.round(position.heading);
        this.terrainService.updatePosition(position);
    }

    @Get('ndmap.png')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiQuery({ name: 'timestamp', required: true })
    @ApiResponse({
        status: 200,
        description: 'The ND map data as a PNG',
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid display or timestamp request',
    })
    async getNdMap(@Query('display') display, @Query('timestamp') timestamp, @Res({ passthrough: true }) response) {
        const data = this.terrainService.MapManager.ndMap(display, parseInt(timestamp));
        if (data === null) {
            throw new HttpException('Invalid timestamp request', HttpStatus.BAD_REQUEST);
        }

        response.set({ 'Content-Type': 'image/png' });
        response.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate' });
        response.set({ Pragma: 'no-cache' });
        response.set({ Expires: '0' });
        response.end(data.Image);
    }

    @Get('renderMap')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiQuery({ name: 'timestamp', required: true })
    @ApiResponse({
        status: 200,
        description: 'The ND map will be rendered',
        type: Number,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid display settings set',
    })
    renderTerrainMap(@Query('display') display) {
        return this.terrainService.MapManager.renderNdMap(display);
    }

    @Get('ndMapAvailable')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiResponse({
        status: 200,
        description: 'The ND map will be rendered',
        type: Boolean,
    })
    ndMapAvailable(@Query('display') display, @Query('timestamp') timestamp) {
        return this.terrainService.MapManager.ndMap(display, parseInt(timestamp)) !== null;
    }

    @Get('terrainRange')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiQuery({ name: 'timestamp', required: true })
    @ApiResponse({
        status: 200,
        description: 'The ND terrain data information',
        type: NDTerrainDataDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid display requested',
    })
    getTerrainRange(@Query('display') display, @Query('timestamp') timestamp) {
        const ndMap = this.terrainService.MapManager.ndMap(display, parseInt(timestamp));
        if (ndMap === null) {
            throw new HttpException('Invalid timestamp request', HttpStatus.BAD_REQUEST);
        }

        const retval = new NDTerrainDataDto();
        retval.minElevation = Math.round(ndMap.MinimumElevation);
        retval.minElevationIsWarning = ndMap.MinimumElevationMode === TerrainLevelMode.Warning;
        retval.minElevationIsCaution = ndMap.MinimumElevationMode === TerrainLevelMode.Caution;
        retval.maxElevation = Math.round(ndMap.MaximumElevation);
        retval.maxElevationIsWarning = ndMap.MaximumElevationMode === TerrainLevelMode.Warning;
        retval.maxElevationIsCaution = ndMap.MaximumElevationMode === TerrainLevelMode.Caution;

        return retval;
    }
}
