import { ApiProperty } from '@nestjs/swagger';

/* eslint-disable camelcase */
export class RenderingDataDto {
  @ApiProperty({ description: 'The rendering timestamp', example: 42 })
  timestamp: number;

  @ApiProperty({ description: 'The encoded pixels', example: '[AHXD45]' })
  frames: string[];
}
