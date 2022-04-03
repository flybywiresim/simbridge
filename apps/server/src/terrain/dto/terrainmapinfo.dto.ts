import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

/* eslint-disable camelcase */
export class TerrainmapInfoDto {
    @ApiProperty({ description: 'The most north latitudinal angle', example: '90' })
    @IsNumber()
    mostNorth: number

    @ApiProperty({ description: 'The most south latitudinal angle', example: '-90' })
    @IsNumber()
    mostSouth: number

    @ApiProperty({ description: 'The most west longitudinal angle', example: '-180' })
    @IsNumber()
    mostWest: number

    @ApiProperty({ description: 'The most east longitudinal angle', example: '180' })
    @IsNumber()
    mostEast: number

    @ApiProperty({ description: 'The step size of latitudinal angles', example: '1' })
    @IsNumber()
    latitudinalStep: number

    @ApiProperty({ description: 'The step size of longitudinal angles', example: '1' })
    @IsNumber()
    longitudinalStep: number

    @ApiProperty({ description: 'The elevation resolution in meters', example: '30' })
    @IsNumber()
    elevationResolution: number
}
