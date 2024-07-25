import { Module } from '@nestjs/common';
import { UtilitiesModule } from '../utilities/utilities.module';
import { TerrainController } from './terrain.controller';
import { TerrainService } from './terrain.service';

@Module({
  controllers: [TerrainController],
  providers: [TerrainService],
  imports: [UtilitiesModule],
})
export class TerrainModule {}
