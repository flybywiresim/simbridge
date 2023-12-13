import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class General {
  @ApiProperty({ description: 'the route in string format' })
  @IsString()
  route: string;
}
