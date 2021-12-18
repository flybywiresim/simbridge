import { Module } from '@nestjs/common';
import { UtilitiesModule } from '../utilities/utilities.module';
import { CoRouteController } from './coroute.controller';
import { CoRouteService } from './coroute.service';

@Module({
    controllers: [CoRouteController],
    providers: [CoRouteService],
    imports: [UtilitiesModule],
})
export class CoRouteModule {}
