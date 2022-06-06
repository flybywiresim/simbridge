import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber } from 'class-validator';

export class NavigationDisplayViewDto {
    @ApiProperty({ description: 'Indicates if the ND map needs to be rendered', example: 'true' })
    @IsBoolean()
    active: boolean

    @ApiProperty({ description: 'The current map width [px]', example: '900' })
    @IsNumber()
    mapWidth: number

    @ApiProperty({ description: 'The current map width [px]', example: '450' })
    @IsNumber()
    mapHeight: number

    @ApiProperty({ description: 'The current meter per pixel ratio', example: '20' })
    @IsNumber()
    meterPerPixel: number

    @ApiProperty({ description: 'Indicates if the ARC mode is active', example: 'true' })
    @IsBoolean()
    arcMode: boolean

    @ApiProperty({ description: 'Indicates if the gear is down', example: 'true' })
    @IsBoolean()
    gearDown: boolean
}
