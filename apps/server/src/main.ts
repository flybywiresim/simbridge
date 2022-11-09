import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { access, mkdirSync } from 'fs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { WsAdapter } from '@nestjs/platform-ws';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { platform } from 'os';
import { hideConsole } from 'node-hide-console-window';
import { getPrivateIp } from './utilities/ip';
import { UtilitiesModule } from './utilities/utilities.module';
import { SysTrayService } from './utilities/systray.service';
import { AppModule } from './app.module';
import { Msfs } from './utilities/msfs';

declare const module: any;

const dirs = [
    'resources/logs',
    'resources/coroutes',
    'resources/pdfs',
    'resources/images',
];

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, cors: true });

    app.enableShutdownHooks();

    // Gateway Adapter
    app.useWebSocketAdapter(new WsAdapter(app));

    // Config
    const configService = app.get(ConfigService);
    const port = configService.get('server.port');
    const isConsoleHidden = configService.get('server.hidden');
    const closeWithMSFS = configService.get('server.closeWithMSFS');

    // Pino
    app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

    // Validation
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    // Folder creation
    generateResourceFolders();

    // Swagger
    const swaggerConfig = new DocumentBuilder()
        .setTitle('FlyByWire SimBridge')
        .setDescription('API Documentation for the Restful Endpoints of the FBW SimBridge application')
        .setVersion('1.0')
        .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, swaggerDocument);

    await app.listen(port);

    const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
    logger.log(`FlyByWire SimBridge started on: http://${getPrivateIp()}:${port}`, 'NestApplication');

    app.select(UtilitiesModule).get(SysTrayService).init(isConsoleHidden, port);

    if (platform() === 'win32' && isConsoleHidden) {
        hideConsole();
    }

    // if exitWithMSFS is activated this tracks if MSFS has even been started before closing
    // the app with MSFS
    let msfsWasRunning = false;
    if (closeWithMSFS) {
        logger.log('Option "Close with MSFS" active.', 'NestApplication');
        setInterval(() => {
            Msfs.isRunning()
                .then((msfsIsRunning: boolean) => {
                    if (msfsIsRunning) {
                        msfsWasRunning = true;
                    } else if (msfsWasRunning) {
                        logger.log('MSFS closed, closing SimBridge.', 'NestApplication');
                        msfsWasRunning = false;
                        app.close();
                    }
                })
                .catch((error) => {
                    logger.error(error);
                });
        }, 5000);
    }

    if (module.hot) {
        module.hot.accept();
        module.hot.dispose(() => app.close());
    }
}

bootstrap();

function generateResourceFolders() {
    dirs.forEach((dir) => {
        access(dir, (error) => {
            if (error) mkdirSync(dir, { recursive: true });
        });
    });
}
