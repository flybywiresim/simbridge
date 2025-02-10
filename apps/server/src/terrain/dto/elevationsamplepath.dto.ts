import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNumber, ValidateNested } from 'class-validator';
import { WaypointDto } from './waypoint.dto';

export class ElevationSamplePathDto {
  @ApiProperty({ description: 'Width of FMS path (dictated by e.g. RNP)', example: '1.0' })
  @IsNumber()
  pathWidth: number;

  @ApiProperty({ description: 'The array of all FMS waypoints of the active flight plan', type: [WaypointDto] })
  @ValidateNested()
  @IsArray()
  @ArrayMinSize(1)
  waypoints: WaypointDto[];
}
