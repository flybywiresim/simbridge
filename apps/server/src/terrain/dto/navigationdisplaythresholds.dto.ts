import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class NavigationDisplayThresholdsDto {
  @ApiProperty({ description: 'The minimum visualized elevation', example: '3000' })
  @IsNumber()
  minElevation: number;

  @ApiProperty({ description: 'Indicates if the lowest elevation is a warning level', example: 'true' })
  @IsNumber()
  minElevationIsWarning: boolean;

  @ApiProperty({ description: 'Indicates if the lowest elevation is a caution level', example: 'true' })
  @IsNumber()
  minElevationIsCaution: boolean;

  @ApiProperty({ description: 'The maximum visualized elevation', example: '7000' })
  @IsNumber()
  maxElevation: number;

  @ApiProperty({ description: 'Indicates if the lowest elevation is a warning level', example: 'true' })
  @IsNumber()
  maxElevationIsWarning: boolean;

  @ApiProperty({ description: 'Indicates if the lowest elevation is a caution level', example: 'true' })
  @IsNumber()
  maxElevationIsCaution: boolean;
}
