import { Module } from '@nestjs/common';
import { UtiliyController } from './utilities.controller';
import { FileService } from './file.service';
import { PrinterService } from './printer.service';

@Module({
    controllers: [UtiliyController],
    providers: [FileService, PrinterService],
    exports: [FileService, PrinterService],
})
export class UtilitiesModule {}
