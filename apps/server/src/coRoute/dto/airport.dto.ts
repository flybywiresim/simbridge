import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class Airport {
  @ApiProperty({ description: 'The departure airport ICAO', example: 'KLAX' })
  @IsString()
  // eslint-disable-next-line camelcase
  icao_code: string;
}
