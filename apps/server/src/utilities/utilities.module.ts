import { Module } from '@nestjs/common';
import { UtiliyController } from './utilities.controller';
import { FileService } from './file.service';
import { PrinterService } from './printer.service';
import { SysTrayService } from './systray.service';
import { ShutDownService } from './shutdown.service';

@Module({
    controllers: [UtiliyController],
    providers: [FileService, PrinterService, SysTrayService, ShutDownService],
    exports: [FileService, PrinterService, ShutDownService],
})
export class UtilitiesModule {}
