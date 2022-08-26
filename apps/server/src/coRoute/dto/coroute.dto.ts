import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, ValidateNested } from 'class-validator';
import { Navlog } from './navlog.dto';
import { General } from './general.dto';
import { Airport } from './airport.dto';

export class CoRouteDto {
    @ApiProperty({ description: 'The name of the coroute' })
    @IsDefined()
    name: String;

    @ApiProperty({ description: 'The departure airport dto' })
    @ValidateNested()
    @IsDefined()
    origin: Airport;

    @ApiProperty({ description: 'The arrival airport dto' })
    @ValidateNested()
    @IsDefined()
    destination: Airport;

    @ApiProperty({ description: 'The alternate airport dto' })
    @ValidateNested()
    @IsDefined()
    alternate: Airport;

    @ApiProperty({ description: 'General information' })
    @ValidateNested()
    @IsDefined()
    general: General;

    @ApiProperty({ description: 'The navlog information of the route' })
    @ValidateNested()
    @IsDefined()
    navlog: Navlog
}
