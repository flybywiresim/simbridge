import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { sharp } from 'sharp';
import { TerrainService } from './terrain.service';
import { Configuration } from './dto/configuration.dto';
import { Position } from './dto/position.dto';
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
        if (this.terrainService.Terrainmap !== undefined) {
            const lat = parseInt(latStr);
            const lon = parseInt(lonStr);

            for (let i = 0; i < this.terrainService.Terrainmap.Tiles.length; ++i) {
                if (this.terrainService.Terrainmap.Tiles[i].Southwest[0] === lat && this.terrainService.Terrainmap.Tiles[i].Southwest[1] === lon) {
                    // const grid = this.terrainService.Terrainmap.Tiles[i].elevationGrid();

                    // const flatten = [].concat(...grid.Grid);
                    // const { data, info } = sharp(flatten, { raw: { width: grid.Columns, height: grid.Rows, channels: 1 } })
                    // const { data, info } = sharp(flatten);
                    //    .toBuffer({ resolveWithObject: true });
                    sharp('./resources/images/images.png')
                        .resize({ width: 200 })
                        .toBuffer()
                        .then((data) => {
                            console.log(data);
                        });
                    // return data;
                    // const png = new PNG({
                    //    width: grid.Columns,
                    //    height: grid.Rows,
                    //    filterType: -1,
                    // });
                    // png.data = [].concat(...grid.Grid);

                    // return PNG.sync.write(png, { colorType: 0 });
                }
            }
        }

        return undefined;
    }
}
