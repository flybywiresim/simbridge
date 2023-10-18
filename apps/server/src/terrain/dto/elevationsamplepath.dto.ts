import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray } from 'class-validator';
import { WaypointDto } from './waypoint.dto';

export class ElevationSamplePathDto {
    @ApiProperty({ description: 'The array of all waypoints', type: [WaypointDto] })
    @IsArray()
    @ArrayMinSize(2)
    waypoints: WaypointDto[]
}
