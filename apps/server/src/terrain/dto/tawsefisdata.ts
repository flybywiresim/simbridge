import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class TawsEfisDataDto {
  @ApiProperty({ description: 'ND range', example: '40' })
  @IsNumber()
  ndRange: number;

  @ApiProperty({ description: 'ND is in ARC mode', example: 'true' })
  @IsNumber()
  arcMode: boolean;

  @ApiProperty({ description: 'TERR (ON ND) is selected', example: 'true' })
  @IsNumber()
  terrSelected: boolean;

  @ApiProperty({ description: 'EFIS mode enum', example: '1' })
  @IsNumber()
  efisMode: number;

  @ApiProperty({ description: 'Lower display limit of VD, in feet', example: '-500' })
  @IsNumber()
  vdRangeLower: number;

  @ApiProperty({ description: 'Upper display limit of VD, in feet', example: '28000' })
  @IsNumber()
  vdRangeUpper: number;
}
