import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { WinstonConfigService } from './config/winston.service';
import { CoRouteModule } from './coRoute/coroute.module';
import { UtilitiesModule } from './utilities/utilities.module';

@Module({ imports: [WinstonModule.forRootAsync({ useClass: WinstonConfigService }), CoRouteModule, UtilitiesModule] })
export class AppModule {}
