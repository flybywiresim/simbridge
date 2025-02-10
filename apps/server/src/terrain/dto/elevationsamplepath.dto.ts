import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNumber } from 'class-validator';
import { WaypointDto } from './waypoint.dto';

export class ElevationSamplePathDto {
  @ApiProperty({ description: 'Width of FMS path (dictated by e.g. RNP)', example: 'true' })
  @IsNumber()
  pathWidth: number;

  @ApiProperty({ description: 'The array of all FMS waypoints of the active flight plan', type: [WaypointDto] })
  @IsArray()
  @ArrayMinSize(2)
  waypoints: WaypointDto[];
}
