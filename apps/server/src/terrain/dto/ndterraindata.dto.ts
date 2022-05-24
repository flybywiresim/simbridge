import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

/* eslint-disable camelcase */
export class NDTerrainDataDto {
    @ApiProperty({ description: 'The minimum visualized elevation', example: '3000' })
    @IsNumber()
    minElevation: number

    @ApiProperty({ description: 'The maximum visualized elevation', example: '7000' })
    @IsNumber()
    maxElevation: number
}
