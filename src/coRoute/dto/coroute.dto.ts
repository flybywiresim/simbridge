import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CoRouteDto {
    @ApiProperty({ description: 'The departure airport ICAO', example: 'KLAX' })
    @IsString()
    @MinLength(3, { message: 'Arrival ICAO is too short, minimum length is 3 characters' })
    departureICAO: string;

    @ApiProperty({ description: 'The arrival airport ICAO', example: 'KLAX' })
    @IsString()
    @MinLength(3, { message: 'Arrival ICAO is too short, minimum length is 3 characters' })
    arrivalICAO: string;

    @ApiProperty({ description: 'the route', example: 'SIRO7N SIROD DCT OBURO UH10 CHABY UM733 KOPOR UM976 ABNUR UT10 ALESO T420 BUZAD DCT' })
    @IsString()
    route: string;
}
