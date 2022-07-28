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
import { hideConsole, showConsole } from 'node-hide-console-window';
import open = require('open')
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
    const isConsoleHidden = configService.get('server.hidden');

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
    logger.log(`FlyByWire SimBridge started on: http://${address()}:${port}`, 'NestApplication');

    buildSysTray(logger, isConsoleHidden, port);

    if (platform() === 'win32' && isConsoleHidden) {
        hideConsole();
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

// for TS
interface MenuItemClickable extends MenuItem {
    click?: () => void
}

function buildSysTray(logger, isConsoleHidden: Boolean, port) {
    let hidden = isConsoleHidden;

    const manageConsole = () => {
        if (hidden) showConsole();
        else hideConsole();
        hidden = !hidden;
    };

    const remoteDisplayItem = {
        title: 'Remote Displays',
        tooltip: 'Open remote displays',
        items: [{
            title: 'Open MCDU',
            tooltip: 'Open the MCDU remote display with your default browser',
            enabled: true,
            click: () => {
                open(`http://localhost:${port}/interfaces/mcdu`);
            },
        }],
    };

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

    const consoleVisibleItem : MenuItemClickable = {
        title: 'Show/Hide',
        tooltip: 'Change console visibility',
        checked: false,
        enabled: true,
        click: () => manageConsole(),
    };

    const sysTray = new SysTray({
        menu: {
            icon: join(__dirname, '/assets/images/tail.ico'),
            title: 'FBW SimBridge',
            tooltip: 'Flybywire SimBridge',
            items: [
                remoteDisplayItem,
                consoleVisibleItem,
                exitItem,
            ],
        },
        copyDir: false,
    });

    sysTray.onClick((action) => {
        // eslint-disable-next-line no-prototype-builtins
        if (action.item.hasOwnProperty('click')) {
            const item = action.item as MenuItemClickable;
            item.click();
        }
    });
}
