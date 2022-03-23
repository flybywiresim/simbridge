import { Module } from '@nestjs/common';
import { NestjsNotificationModule } from '@sinuos/nestjs-notification';
import { UtiliyController } from './utilities.controller';
import { FileService } from './file.service';
import { PrinterService } from './printer.service';

@Module({
    controllers: [UtiliyController],
    providers: [FileService, PrinterService],
    exports: [FileService, PrinterService],
    imports: [NestjsNotificationModule.register(null)],
})
export class UtilitiesModule {}
