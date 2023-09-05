import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';
import { ElevationSamplePathDto } from './elevationsamplepath.dto';

export class ElevationProfileRequestDto {
    @ApiProperty({
        description: 'The array of all waypoints along the requested path',
        type: ElevationSamplePathDto,
    })
    path: ElevationSamplePathDto

    @ApiProperty({
        description: 'Number of sample points along the path in meters',
        example: '100',
        type: Number,
    })
    @IsNumber({ allowInfinity: false, allowNaN: false })
    sampleDistance: number
}
