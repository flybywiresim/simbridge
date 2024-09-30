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
import * as path from 'path';
import { getSimbridgeDir } from 'apps/server/src/utilities/pathUtil';
import { ShutDownService } from './utilities/shutdown.service';
import { AppModule } from './app.module';
import { NetworkService } from './utilities/network.service';
import { existsSync, writeFileSync } from 'fs';

declare const module: any;

const dirs = ['resources/logs', 'resources/coroutes', 'resources/pdfs', 'resources/images'];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, cors: true });

  app.enableShutdownHooks();

  // Shutdown listener
  app.get(ShutDownService).subscribeToShutdown(() => app.close());

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
  logger.log(
    `FlyByWire SimBridge started on: http://${await app.get(NetworkService).getLocalIp(true)}:${port}`,
    'NestApplication',
  );

  if (platform() === 'win32' && isConsoleHidden) {
    hideConsole();
  }

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => app.close());
  }
}

generateResourceFolders();
generateDefaultProperties();

bootstrap();

function generateResourceFolders() {
  dirs.forEach((dir) => {
    access(dir, (error) => {
      if (error) mkdirSync(path.join(getSimbridgeDir(), dir), { recursive: true });
    });
  });
}

function generateDefaultProperties() {

  const propertiesFilePath = path.join(getSimbridgeDir(), '/resources', '/properties.json');

  const defaultProperties = {
    server: {
      port: 8380,
      hidden: true,
      closeWithMSFS: false
    },
    printer: {
      enabled: false,
      printerName: null,
      fontSize: 19,
      paperSize: "A4",
      margin: 30
    }
  };


  if (!existsSync(propertiesFilePath)) {
    writeFileSync(propertiesFilePath, JSON.stringify(defaultProperties));
  }
}
