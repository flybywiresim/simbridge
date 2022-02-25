import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { InterfacesModule } from './interfaces/interfaces.module';
import { WinstonConfigService } from './config/winston.service';
import { CoRouteModule } from './coRoute/coroute.module';
import { UtilitiesModule } from './utilities/utilities.module';

@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'dist/mcdu'),
            serveRoot: '/interfaces/mcdu',
        }),
        WinstonModule.forRootAsync({ useClass: WinstonConfigService }),
        CoRouteModule,
        UtilitiesModule,
        InterfacesModule,
    ],
})
export class AppModule {}
