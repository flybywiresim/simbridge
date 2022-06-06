import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/* eslint-disable camelcase */
export class NDMapDto {
    @ApiProperty({ description: 'The encoded pixels', example: 'AHXD45' })
    @IsString()
    pixels: string
}
