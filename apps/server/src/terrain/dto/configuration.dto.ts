import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber } from 'class-validator';

/* eslint-disable camelcase */
export class ConfigurationDto {
    @ApiProperty({ description: 'Resets the terrain manager', example: 'false' })
    @IsBoolean()
    reset: boolean = false;

    @ApiProperty({ description: 'The maximum visibility range [nm]', example: '400' })
    @IsNumber()
    visibilityRange: number

    @ApiProperty({ description: 'ND map update interval [s]', example: '1' })
    @IsNumber()
    ndMapUpdateInterval: number
}
