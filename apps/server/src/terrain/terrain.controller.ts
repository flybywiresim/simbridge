import { Controller, Get, Query, Patch, Body, BadRequestException, NotFoundException, Put } from '@nestjs/common';
import { ApiProduces, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';
import { ConfigurationDto } from './dto/configuration.dto';
import { PositionDto } from './dto/position.dto';
import { NDViewDto } from './dto/ndview.dto';
import { NDMapDto } from './dto/ndmap.dto';

const sharp = require('sharp');

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
    @ApiResponse({
        status: 400,
        description: 'Unable to update the current position',
    })
    positionUpdate(@Body() position: PositionDto) {
        if (this.terrainService.updatePosition(position) === false) {
            throw new BadRequestException('Unable to update the present position');
        }
        this.presentHeading = position.heading;
    }

    @Get('ndmap')
    @ApiResponse({
        status: 200,
        description: 'The current ND map',
        type: NDMapDto,
    })
    @ApiResponse({
        status: 400,
        description: 'No ND map available',
    })
    @ApiProduces('image/png')
    async getNDMap(@Query('ndIndex') ndIndex: string): Promise<NDMapDto> {
        const { buffer, rows, columns } = this.terrainService.MapManager.ndMap(ndIndex);
        if (rows === 0 || columns === 0) {
            throw new BadRequestException('Unable to create the ND map');
        }

        const response = new NDMapDto();
        const { data, _ } = await sharp(new Uint8ClampedArray(buffer), { raw: { width: columns, height: rows, channels: 3 } })
            .toFormat('png')
            .toBuffer({ resolveWithObject: true });

        await sharp(new Uint8ClampedArray(buffer), { raw: { width: columns, height: rows, channels: 3 } })
            .toFile('ndtest.png');

        response.pixels = Buffer.from(data.buffer, 'binary').toString('base64');
        return response;
    }
}
