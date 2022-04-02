import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber } from 'class-validator';

/* eslint-disable camelcase */
export class Position {
    @ApiProperty({ description: 'The current latitudinal value [deg]', example: '42.552' })
    @IsBoolean()
    latitude: number

    @ApiProperty({ description: 'The current longitudinal value [deg]', example: '13.2205' })
    @IsNumber()
    longitude: number

    @ApiProperty({ description: 'The current heading [deg]', example: '260' })
    @IsNumber()
    heading: number
}
