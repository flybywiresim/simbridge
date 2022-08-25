import { Module } from '@nestjs/common';
import { UtiliyController } from './utilities.controller';
import { FileService } from './file.service';
import { PrinterService } from './printer.service';
import { ShutDownService } from './shutdown.service';

@Module({
    controllers: [UtiliyController],
    providers: [FileService, PrinterService, ShutDownService],
    exports: [FileService, PrinterService],
})
export class UtilitiesModule {}
