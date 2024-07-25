import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/* eslint-disable camelcase */
export class Fix {
  @ApiProperty({ description: 'The ident of the fix', example: 'MERIT' })
  @IsString()
  ident: string;

  @ApiProperty({ description: 'The name of the fix', example: 'MERIT' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'The type of the fix', example: 'wpt' })
  @IsString()
  type: string;

  @ApiProperty({ description: 'the airway along which the fix is on', example: 'DCT' })
  @IsString()
  via_airway: string;

  @ApiProperty({ description: 'if the fix is a SID/STAR', example: '0' })
  @IsString()
  is_sid_star: string;

  @ApiProperty({ description: 'the latitude position of the fix', example: '41.381950' })
  @IsString()
  pos_lat: string;

  @ApiProperty({ description: 'the longitude position of the fix', example: '-73.137431' })
  @IsString()
  pos_long: string;
}
