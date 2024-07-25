import { Module } from '@nestjs/common';
import { CoRouteConverter } from './coroute.converter';
import { UtilitiesModule } from '../utilities/utilities.module';
import { CoRouteController } from './coroute.controller';
import { CoRouteService } from './coroute.service';

@Module({
  controllers: [CoRouteController],
  providers: [CoRouteService, CoRouteConverter],
  imports: [UtilitiesModule],
})
export class CoRouteModule {}
