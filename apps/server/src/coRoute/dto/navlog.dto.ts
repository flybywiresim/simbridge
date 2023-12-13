import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, ValidateNested } from 'class-validator';
import { Fix } from './fix.dto';

export class Navlog {
  @ApiProperty({ description: 'the array of fixes making up the route of the flight' })
  @ValidateNested()
  @IsDefined()
  fix: Fix[] = [];
}
