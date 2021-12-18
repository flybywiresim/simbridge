import { Module } from '@nestjs/common';
import { CoRouteModule } from './coRoute/coroute.module';
import { UtilitiesModule } from './utilities/utilities.module';

@Module({ imports: [CoRouteModule, UtilitiesModule] })
export class AppModule {}
