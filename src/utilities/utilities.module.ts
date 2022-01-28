import { Module } from '@nestjs/common';
import { UtiliyController } from './utilities.controller';
import { FileService } from './file.service';

@Module({
    controllers: [UtiliyController],
    providers: [FileService],
    exports: [FileService],
})
export class UtilitiesModule {}
