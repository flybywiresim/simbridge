import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { CoRouteModule } from './coRoute/coroute.module';
import { UtilitiesModule } from './utilities/utilities.module';

@Module({
    imports: [LoggerModule.forRoot(/* {
        pinoHttp: {
            transport: {
                targets: [
                    { target: 'pino/file', level: 'debug', options: { destination: 'resources/logs/local-server/debug.log', mkdir: true } },
                    { target: 'pino-pretty', level: 'info', options: { colorize: true, levelFirst: true, translateTime: 'UTC:dd/mm/yyyy, h:MM:ss TT Z', destination: 1 } },
                ],
            },
        },

    } */), CoRouteModule, UtilitiesModule],
})
export class AppModule {}
