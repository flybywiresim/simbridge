import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNumber } from 'class-validator';

export class ElevationProfileResponseDto {
  @ApiProperty({ description: 'Sampled elevation points', type: [Number] })
  @IsArray()
  @IsNumber({ allowInfinity: false, allowNaN: false }, { each: true })
  @ArrayMinSize(2)
  elevationProfile: number[];
}
