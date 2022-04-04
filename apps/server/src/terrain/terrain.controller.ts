import { Controller, Get, Post, Patch, Body, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiProduces, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';
import { ConfigurationDto } from './dto/configuration.dto';
import { PositionDto } from './dto/position.dto';
import { NDViewDto } from './dto/ndview.dto';

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
    @ApiBody({
        description: 'The new connection containing the flight number and current location',
        type: NDViewDto,
    })
    @ApiResponse({
        status: 200,
        description: 'The current ND map',
        type: Buffer,
    })
    @ApiProduces('image/png')
    async createNDMap(@Body() config: NDViewDto): Promise<Buffer> {
        const { buffer, rows, columns } = this.terrainService.MapManager.createMapND(config);
        let pngBuffer: Buffer | undefined = undefined;

        if (config.rotateAroundHeading === true) {
            pngBuffer = await sharp(buffer, { raw: { width: columns, height: rows, channels: 3 } })
                .rotate(-1 * this.presentHeading)
                .toFormat('png')
                .toBuffer();
        } else {
            pngBuffer = await sharp(buffer, { raw: { width: columns, height: rows, channels: 3 } })
                .toFormat('png')
                .toBuffer();
        }

        return pngBuffer;
    }

    @Get('tile')
    @ApiResponse({
        status: 200,
        description: 'The elevation grid of a tile',
    })
    @ApiProduces('image/png')
    async getTile(@Query('lat') latStr: string, @Query('lon') lonStr: string): Promise<void> {
        const map = this.terrainService.Terrainmap;

        if (map !== undefined) {
            const lat = parseInt(latStr);
            const lon = parseInt(lonStr);

            for (let i = 0; i < map.Tiles.length; ++i) {
                if (map.Tiles[i].Southwest.latitude === lat && map.Tiles[i].Southwest.longitude === lon) {
                    const grid = map.Tiles[i].elevationGrid();

                    if (grid.Columns !== 0 && grid.Rows !== 0) {
                        let maxElev = 0;
                        grid.Grid.forEach((row) => {
                            row.forEach((cell) => {
                                if (maxElev < cell) {
                                    maxElev = cell;
                                }
                            });
                        });
                        const pixels = [].concat(...grid.Grid);
                        for (let i = 0; i < pixels.length; ++i) {
                            pixels[i] = Math.round((pixels[i] / maxElev) * 255);
                        }

                        const pixelBuffer = new Uint8ClampedArray(pixels);
                        const pngBuffer = await sharp(pixelBuffer, { raw: { width: grid.Columns, height: grid.Rows, channels: 1 } })
                            .toFormat('png')
                            .toBuffer();
                        sharp(pngBuffer).toFile('./test.png');
                    }
                }
            }
        }
    }
}
