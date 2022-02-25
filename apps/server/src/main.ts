import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { access, mkdirSync } from 'fs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { WsAdapter } from '@nestjs/platform-ws';
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

    app.useWebSocketAdapter(new WsAdapter(app));

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
    SwaggerModule.setup('local-api', app, swaggerDocument);

    await app.listen(3838);

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