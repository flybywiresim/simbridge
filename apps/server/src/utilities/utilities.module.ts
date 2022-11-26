import { Module } from '@nestjs/common';
import { IpService } from './ip.service';
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
        IpService,
    ],
    exports: [FileService, PrinterService, ShutDownService, IpService],
})
export class UtilitiesModule {}
