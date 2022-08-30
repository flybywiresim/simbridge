import { Module } from '@nestjs/common';
import { UtiliyController } from './utilities.controller';
import { FileService } from './file.service';
import { PrinterService } from './printer.service';
import { ShutDownService } from './shutdown.service';
import { SysTrayService } from './systray.service';

@Module({
    controllers: [UtiliyController],
    providers: [FileService, PrinterService, ShutDownService, SysTrayService],
    exports: [FileService, PrinterService, SysTrayService],
})
export class UtilitiesModule {}
