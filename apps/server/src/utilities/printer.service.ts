import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { join } from 'path';
import { tmpdir } from 'os';
import * as print from 'pdf-to-printer';
import * as PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';
import printerConfig from '../config/printer.config';

@Injectable()
export class PrinterService {
    constructor(@Inject(printerConfig.KEY) private printerConf: ConfigType<typeof printerConfig>) {}

    private readonly logger = new Logger(PrinterService.name);

    private selectedPrinter = this.selectPrinter()

    private async selectPrinter() {
        if (this.printerConf.enabled && !this.printerConf.printerName) {
            try {
                const printers = await print.getPrinters();
                if (printers) {
                    this.logger.debug(`Current Printers ${printers.map((printer) => printer.name)}`);
                    return printers.find(((printer) => printer.name === this.printerConf.printerName));
                }
                this.logger.error('No printers detected');
                return null;
            } catch (error) {
                this.logger.error('Failed to load printers, Make sure the "Printer Spooler" Windows service is running', error);
                return null;
            }
        }
        this.logger.log('Printer disabled or null printerName');
        return null;
    }

    async print(lines: any) {
        const foundPrinter = await this.selectedPrinter;
        if (foundPrinter) {
            const doc = new PDFDocument({ size: this.printerConf.paperSize, margin: this.printerConf.margin });
            const pdfPath = join(tmpdir(), 'a32nxPrint.pdf');

            doc.pipe(createWriteStream(pdfPath));
            // doc.font()
            doc.fontSize(this.printerConf.fontSize);
            for (let i = 0; i < lines.length; i++) {
                doc.text(lines[i], { align: 'left' });
                doc.moveDown();
            }
            doc.end();
            print.print(pdfPath, { printer: foundPrinter.name, sumatraPdfPath: `${process.cwd()}/resources/SumatraPDF.exe` });
        }
    }
}
