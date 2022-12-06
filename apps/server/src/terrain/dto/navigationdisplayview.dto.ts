import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

export class NavigationDisplayViewDto {
    @ApiProperty({ description: 'Indicates if the ND map needs to be rendered', example: 'true' })
    @IsBoolean()
    active: boolean

    @ApiProperty({ description: 'The current map width [px]', example: '450' })
    @IsNumber()
    mapHeight: number

    @ApiProperty({ description: 'The current meter per pixel ratio', example: '20' })
    @IsNumber()
    meterPerPixel: number

    @ApiProperty({ description: 'The map transition time [s]', example: '2' })
    @IsNumber()
    mapTransitionTime: number

    @ApiProperty({ description: 'The map transition FPS', example: '20' })
    @IsNumber()
    mapTransitionFps: number

    @ApiProperty({ description: 'Indicates if the ARC mode is active', example: 'true' })
    @IsBoolean()
    arcMode: boolean

    @ApiProperty({ description: 'Indicates if the gear is down', example: 'true' })
    @IsBoolean()
    gearDown: boolean

    @ApiProperty({ description: 'The latitude of the destination', example: 52.3923 })
    @IsOptional()
    @IsNumber()
    destinationLatitude?: number

    @ApiProperty({ description: 'The longitude of the destination', example: 14.2424 })
    @IsOptional()
    @IsNumber()
    destinationLongitude?: number

    @ApiProperty({ description: 'The lower border of the elevation filter', example: 200 })
    @IsOptional()
    @IsNumber()
    cutOffAltitudeMinimimum?: number

    @ApiProperty({ description: 'The upper border of the elevation filter', example: 400 })
    @IsOptional()
    @IsNumber()
    cutOffAltitudeMaximum?: number
}
