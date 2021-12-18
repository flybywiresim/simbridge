import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

declare const module: any;

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // Validation
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

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
