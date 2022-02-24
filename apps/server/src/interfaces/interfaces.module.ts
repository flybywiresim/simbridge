import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { InterfacesController } from './interfaces.controller';
import { McduGateway } from './mcdu.gateway';

@Module({
    controllers: [InterfacesController],
    providers: [McduGateway],
    imports: [
        ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'mcdu') }),
    ],
})
export class InterfacesModule {}
