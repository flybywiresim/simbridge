import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NavigationDisplayThresholdsDto } from './dto/navigationdisplaythresholds.dto';
import { TerrainService } from './terrain.service';

enum DisplaySide {
    Left = 'L',
    Right = 'R',
}

@ApiTags('TERRAIN')
@Controller('api/v1/terrain')
export class TerrainController {
    constructor(private terrainService: TerrainService) {}

    @Get('renderingTimestamp')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiResponse({
        status: 200,
        description: 'The timestamp of the current rendering data',
        type: Number,
    })
    renderingTimestamp(@Query('display') display) {
        return this.terrainService.frameDataTimestamp(display);
    }

    @Get('renderingThresholds')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiResponse({
        status: 200,
        description: 'The thresholds for the current rendering data',
        type: NavigationDisplayThresholdsDto,
    })
    renderingThresholds(@Query('display') display) {
        return this.terrainService.frameDataThresholds(display);
    }

    @Get('renderingFrames')
    @ApiQuery({ name: 'display', required: true, enum: DisplaySide })
    @ApiResponse({
        status: 200,
        description: 'The base64 strings for the current frames',
        type: [String],
    })
    renderingFrames(@Query('display') display) {
        return this.terrainService.frameData(display).then((data) => {
            const retval = [];
            data.frames.forEach((frame: Uint8ClampedArray) => retval.push(Buffer.from(frame).toString('base64')));
            return retval;
        });
    }
}
