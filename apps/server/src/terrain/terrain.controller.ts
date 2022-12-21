import { Controller, Get, Patch, Body, Put, Query } from '@nestjs/common';
import { ApiResponse, ApiTags, ApiBody, ApiQuery } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';
import { PositionDto } from './dto/position.dto';
import { NavigationDisplayViewDto } from './dto/navigationdisplayview.dto';

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
        // if (this.terrainService.Terrainmap === undefined || this.terrainService.MapManager === undefined) {
        //     throw new NotFoundException('System not initialized');
        // }
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
    configureDisplay(@Query('display') display, @Body() config: NavigationDisplayViewDto): void {
        this.terrainService.configureNavigationDisplay(display, config);
    }
}
