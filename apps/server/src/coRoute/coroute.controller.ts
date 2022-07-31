import { Controller, Get, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { CoRouteService } from './coroute.service';
import { CoRouteDto } from './dto/coroute.dto';

@ApiTags('COROUTE')
@Controller('api/v1/coroute')
export class CoRouteController {
    constructor(private coRouteService: CoRouteService) {}

    @Get('length')
    @ApiResponse({
        status: 200,
        description: 'the number of files in the coroutes folder',
        type: Number,
    })
    @ApiResponse({
        status: 404,
        description: 'unable to find the coroutes folder',
    })
    async getNumOfRoutes(): Promise<number> {
        return this.coRouteService.getNumOfRoutes();
    }

    @Get()
    @ApiResponse({
        status: 200,
        description: 'The company route in JSON format',
        type: CoRouteDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Unable to find the coroute',
    })
    async getRte(@Query('rteNum') routeNum: String): Promise<CoRouteDto> {
        return this.coRouteService.getForRteNum(routeNum);
    }

    @Get('list')
    @ApiResponse({
        status: 200,
        description: 'The list of company routes matching the given origin and destination ICAOs',
        type: [CoRouteDto],
    })
    async getRteForIcaos(@Query('origin') originIcao: String, @Query('destination') destinationIcao: String) {
        return this.coRouteService.getRoutesForIcao(originIcao, destinationIcao);
    }
}
