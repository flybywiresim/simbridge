import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { InterfacesModule } from './interfaces/interfaces.module';
import { WinstonConfigService } from './config/winston.service';
import { CoRouteModule } from './coRoute/coroute.module';
import { TerrainModule } from './terrain/terrain.module';
import { UtilitiesModule } from './utilities/utilities.module';
import printerConfig from './config/printer.config';
import serverConfig from './config/server.config';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'dist/mcdu'),
      serveRoot: '/interfaces/mcdu',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'dist/remote'),
      serveRoot: '/interfaces/remote',
    }),
    WinstonModule.forRootAsync({ useClass: WinstonConfigService }),
    ConfigModule.forRoot({ isGlobal: true, load: [printerConfig, serverConfig] }),
    CoRouteModule,
    TerrainModule,
    UtilitiesModule,
    InterfacesModule,
    HealthModule,
  ],
})
export class AppModule {}
