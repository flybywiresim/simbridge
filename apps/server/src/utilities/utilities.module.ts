import { Module } from '@nestjs/common';
import { UtilityController } from './utilities.controller';
import { FileService } from './file.service';
import { PrinterService } from './printer.service';
import { ShutDownService } from './shutdown.service';
import { SysTrayService } from './systray.service';

@Module({
    controllers: [UtilityController],
    providers: [FileService, PrinterService, ShutDownService, SysTrayService],
    exports: [FileService, PrinterService],
})
export class UtilitiesModule {}
