import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { InterfacesModule } from './interfaces/interfaces.module';
import { WinstonConfigService } from './config/winston.service';
import { CoRouteModule } from './coRoute/coroute.module';
import { UtilitiesModule } from './utilities/utilities.module';
import printerConfig from './config/printer.config';
import serverConfig from './config/server.config';

@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'dist/mcdu'),
            serveRoot: '/interfaces/mcdu',
        }),
        WinstonModule.forRootAsync({ useClass: WinstonConfigService }),
        ConfigModule.forRoot({ isGlobal: true, load: [printerConfig, serverConfig], envFilePath: './resources/properties.env' }),
        CoRouteModule,
        UtilitiesModule,
        InterfacesModule,
    ],
})
export class AppModule {}
