import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { access, mkdirSync } from 'fs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { WsAdapter } from '@nestjs/platform-ws';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { address } from 'ip';
import SysTray, { MenuItem } from 'systray2';
import { join } from 'path';
import { platform } from 'os';
import { AppModule } from './app.module';

declare const module: any;

const dirs = [
    'resources/logs/local-api',
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

    // Pino
    app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

    // Validation
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    // Folder creation
    generateResourceFolders();

    // Swagger
    const swaggerConfig = new DocumentBuilder()
        .setTitle('FlyByWire Simulations Local API')
        .setDescription('The FlyByWire Simulations Local API Description')
        .setVersion('1.0')
        .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, swaggerDocument);

    await app.listen(port);

    const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
    logger.log(`Local API started on: http://${address()}:${port}`, 'NestApplication');

    buildSysTray(logger);

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

// for TS
interface MenuItemClickable extends MenuItem {
    click?: () => void
}

function buildSysTray(logger) {
    const exitItem : MenuItemClickable = {
        title: 'Exit',
        tooltip: 'Kill the server',
        checked: false,
        enabled: true,
        click: () => {
            logger.log('Exiting via Tray', 'Systems Tray');
            sysTray.kill(true);
        },
    };

    const sysTray = new SysTray({
        menu: {
            icon: platform() === 'win32' ? join(__dirname, '/assets/images/tail.ico') : join(__dirname, '/assets/images/tail.png'),
            title: 'FBW Local API',
            tooltip: 'Flybywire Local Api',
            items: [
                exitItem,
            ],
        },
        copyDir: true,
    });

    sysTray.onClick((action) => {
        // eslint-disable-next-line no-prototype-builtins
        if (action.item.hasOwnProperty('click')) {
            const item = action.item as MenuItemClickable;
            item.click();
        }
    });
}
