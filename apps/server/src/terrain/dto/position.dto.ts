import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

/* eslint-disable camelcase */
export class PositionDto {
    @ApiProperty({ description: 'The current latitudinal value [deg]', example: '42.552' })
    @IsNumber()
    latitude: number

    @ApiProperty({ description: 'The current longitudinal value [deg]', example: '13.2205' })
    @IsNumber()
    longitude: number

    @ApiProperty({ description: 'The current heading [deg]', example: '260' })
    @IsNumber()
    heading: number

    @ApiProperty({ description: 'The current altitude [feet]', example: '26000' })
    @IsNumber()
    altitude: number

    @ApiProperty({ description: 'Vertical speed [feet/minute]', example: '-2000' })
    @IsNumber()
    verticalSpeed: number
}
