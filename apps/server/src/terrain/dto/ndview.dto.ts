import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber } from 'class-validator';

/* eslint-disable camelcase */
export class NDViewDto {
    @ApiProperty({ description: 'The current radius [NM]', example: '20' })
    @IsNumber()
    viewRadius: number

    @ApiProperty({ description: 'The current meter per pixel ratio', example: '20' })
    @IsNumber()
    meterPerPixel: number

    @ApiProperty({ description: 'Indicates if the view needs to be rotated', example: 'true' })
    @IsBoolean()
    rotateAroundHeading: boolean
}
