import { Module } from '@nestjs/common';
import { NetworkService } from './network.service';
import { UtilityController } from './utilities.controller';
import { FileService } from './file.service';
import { PrinterService } from './printer.service';
import { SysTrayService } from './systray.service';
import { MsfsService } from './msfs.service';
import { ShutDownService } from './shutdown.service';

@Module({
    controllers: [UtilityController],
    providers: [
        FileService,
        PrinterService,
        SysTrayService,
        MsfsService,
        ShutDownService,
        NetworkService,
    ],
    exports: [FileService, PrinterService, ShutDownService, NetworkService],
})
export class UtilitiesModule {}
