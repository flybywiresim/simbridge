import { Controller, Get, Patch, Body, BadRequestException, NotFoundException, Put, Res, Query, HttpStatus, HttpException } from '@nestjs/common';
import { ApiResponse, ApiTags, ApiBody, ApiQuery } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';
import { PositionDto } from './dto/position.dto';
import { NavigationDisplayViewDto } from './dto/navigationdisplayview.dto';
import { NavigationDisplayTerrainDataDto } from './dto/navigationdisplayterraindata.dto';
import { TerrainLevelMode } from './manager/navigationdisplaydata';

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
            throw new NotFoundException('System not initialized');
        }
    }

    @Put('displaysettings')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiBody({
        description: 'The new connection containing the flight number and current location',
        type: NavigationDisplayViewDto,
    })
    @ApiResponse({
        status: 200,
        description: 'Updated the ND display configuration',
    })
    @ApiResponse({
        status: 400,
        description: 'Unable to update the display configuration',
    })
    configureDisplay(@Query('display') display, @Body() config: NavigationDisplayViewDto): void {
        if (this.terrainService.Terrainmap === undefined || this.terrainService.MapManager === undefined) {
            throw new BadRequestException('System not initialized');
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

    @Get('ndmaps')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiQuery({ name: 'timestamp', required: true })
    @ApiResponse({
        status: 200,
        description: 'The ND map data as a Base64',
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid display or timestamp request',
    })
    async getAllNdMapsBase64(@Query('display') display, @Query('timestamp') timestamp) {
        if (this.terrainService.Terrainmap === undefined || this.terrainService.MapManager === undefined) {
            throw new HttpException('System not initialized', HttpStatus.BAD_REQUEST);
        }

        const data = this.terrainService.MapManager.ndMap(display, parseInt(timestamp));
        if (data === null) {
            throw new HttpException('Invalid timestamp request', HttpStatus.BAD_REQUEST);
        }

        return data.ImageSequence;
    }

    @Get('renderMap')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
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
        if (this.terrainService.Terrainmap === undefined || this.terrainService.MapManager !== undefined) {
            return this.terrainService.MapManager.renderNdMap(display);
        }
        return -1;
    }

    @Get('ndMapAvailable')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiResponse({
        status: 200,
        description: 'The ND map will be rendered',
        type: Boolean,
    })
    ndMapAvailable(@Query('display') display, @Query('timestamp') timestamp) {
        if (this.terrainService.Terrainmap === undefined || this.terrainService.MapManager !== undefined) {
            return this.terrainService.MapManager.ndMap(display, parseInt(timestamp)) !== null;
        }
        return false;
    }

    @Get('terrainRange')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiQuery({ name: 'timestamp', required: true })
    @ApiResponse({
        status: 200,
        description: 'The ND terrain data information',
        type: NavigationDisplayTerrainDataDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid display requested',
    })
    getTerrainRange(@Query('display') display, @Query('timestamp') timestamp) {
        if (this.terrainService.Terrainmap === undefined || this.terrainService.MapManager === undefined) {
            throw new HttpException('System not initialized', HttpStatus.BAD_REQUEST);
        }

        const ndMap = this.terrainService.MapManager.ndMap(display, parseInt(timestamp));
        if (ndMap === null) {
            throw new HttpException('Invalid timestamp request', HttpStatus.BAD_REQUEST);
        }

        const retval = new NavigationDisplayTerrainDataDto();
        retval.minElevation = Math.round(ndMap.MinimumElevation);
        retval.minElevationIsWarning = ndMap.MinimumElevationMode === TerrainLevelMode.Warning;
        retval.minElevationIsCaution = ndMap.MinimumElevationMode === TerrainLevelMode.Caution;
        retval.maxElevation = Math.round(ndMap.MaximumElevation);
        retval.maxElevationIsWarning = ndMap.MaximumElevationMode === TerrainLevelMode.Warning;
        retval.maxElevationIsCaution = ndMap.MaximumElevationMode === TerrainLevelMode.Caution;

        return retval;
    }
}
