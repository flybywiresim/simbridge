import { Controller, Get, Query } from '@nestjs/common';
import { ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { sharp } from 'sharp';
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
        return this.terrainService.Terrainmap.then((map) => {
            if (map !== undefined) {
                const lat = parseInt(latStr);
                const lon = parseInt(lonStr);

                for (let i = 0; i < map.Tiles.length; ++i) {
                    if (map.Tiles[i].Southwest[0] === lat && map.Tiles[i].Southwest[1] === lon) {
                        const grid = map.Tiles[i].elevationGrid();

                        const flatten = [].concat(...grid.Grid);
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
        });
    }
}
