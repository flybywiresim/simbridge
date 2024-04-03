import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class WaypointDto {
  @ApiProperty({
    description: 'Latitude coordinate according to WGS84',
    example: '42.197',
    type: Number,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({
    description: 'Longitude coordinate according to WGS84',
    example: '13.225',
    type: Number,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude: number;
}
