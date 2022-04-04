import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber } from 'class-validator';

/* eslint-disable camelcase */
export class NDMapDto {
    @ApiProperty({ description: 'The number of pixels in x-direction', example: '20' })
    @IsNumber()
    width: number

    @ApiProperty({ description: 'The number of pixels in y-direction', example: '20' })
    @IsNumber()
    height: number

    @ApiProperty({ description: 'The encoded pixels', example: 'AHXD45' })
    @IsString()
    pixels: string
}
