import { ApiProperty } from '@nestjs/swagger';
import { ValidateNested } from 'class-validator';
import { Navlog } from './navlog.dto';
import { General } from './general.dto';
import { Airport } from './airport.dto';

export class CoRouteDto {
    @ApiProperty({ description: 'The departure airport dto' })
    @ValidateNested()
    origin: Airport;

    @ApiProperty({ description: 'The arrival airport dto' })
    @ValidateNested()
    destination: Airport;

    @ApiProperty({ description: 'General information' })
    @ValidateNested()
    general: General;

    @ApiProperty({ description: 'The navlog information of the route' })
    @ValidateNested()
    navlog: Navlog
}
