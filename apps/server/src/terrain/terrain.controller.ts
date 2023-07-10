import { DisplaySide } from './types';
import { NavigationDisplayThresholdsDto } from './dto/navigationdisplaythresholds.dto';
import { TerrainService } from './terrain.service';
import { ShutDownService } from '../utilities/shutdown.service';

@ApiTags('TERRAIN')
@Controller('api/v1/terrain')
export class TerrainController {
    constructor(private terrainService: TerrainService, private shutdownService: ShutDownService) {}

    @Get('renderingTimestamp')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiResponse({
        status: 200,
        description: 'The timestamp of the current rendering data',
        type: Number,
    })
    renderingTimestamp(@Query('display') display: DisplaySide) {
        return this.terrainService.frameData(display).then((data) => {
            if (data === undefined) return -1;
            return data.timestamp;
        });
    }

    @Get('renderingThresholds')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiResponse({
        status: 200,
        description: 'The thresholds for the current rendering data',
        type: NavigationDisplayThresholdsDto,
    })
    renderingThresholds(@Query('display') display: DisplaySide) {
        return this.terrainService.frameData(display).then((data) => {
            if (data === undefined) return undefined;
            return data.thresholds;
        });
    }

    @Get('renderingFrames')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiResponse({
        status: 200,
        description: 'The base64 strings for the current frames',
        type: [String],
    })
    renderingFrames(@Query('display') display: DisplaySide) {
        return this.terrainService.frameData(display).then((data) => {
            if (data === undefined) return [];

            const retval = [];
            data.frames.forEach((frame: Uint8ClampedArray) => retval.push(Buffer.from(frame).toString('base64')));
            return retval;
        });
    }
}
