import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { join } from 'path';
import { tmpdir, platform } from 'os';
import * as print from 'pdf-to-printer';
import * as printUnix from 'unix-print';
import * as PDFDocument from 'pdfkit';
import { createWriteStream, readFileSync } from 'fs';
import printerConfig from '../config/printer.config';

@Injectable()
export class PrinterService {
    constructor(@Inject(printerConfig.KEY) private printerConf: ConfigType<typeof printerConfig>) {}

    private readonly logger = new Logger(PrinterService.name);

    private selectedPrinter = this.selectPrinter()

    private fontBuffer = readFileSync(join(__dirname, '..', 'assets/fonts/RobotoMono-Bold.ttf'))

    private retrievePrinterNames() {
        return platform() === 'win32' ? print.getPrinters() : printUnix.getPrinters();
    }

    private async selectPrinter() {
        let printers: any[];
        try {
            printers = await this.retrievePrinterNames();

            this.logger.debug(`Current Printers: ${printers.map((printer) => printer.name)}`);
            if (!printers) {
                this.logger.error('No printers detected');
                return null;
            }

            if (this.printerConf.enabled && this.printerConf.printerName !== null) {
                const foundPrinter = printers.find(((printer) => printer.name === this.printerConf.printerName));
                if (foundPrinter) {
                    return foundPrinter;
                }
                this.logger.error(`Printer selected: ${this.printerConf.printerName} does not match found printers`);
                return null;
            }
            this.logger.log('Printer disabled or null printerName');
            return null;
        } catch (error) {
            this.logger.error('Error retrieving printers list', error);
            return null;
        }
    }

    async print(lines: any) {
        try {
            const foundPrinter = await this.selectedPrinter;
            if (foundPrinter) {
                const doc = new PDFDocument({ size: this.printerConf.paperSize, margin: this.printerConf.margin });
                const pdfPath = join(tmpdir(), 'a32nxPrint.pdf');

                doc.pipe(createWriteStream(pdfPath));
                doc.font(this.fontBuffer);
                doc.fontSize(this.printerConf.fontSize);
                for (let i = 0; i < lines.length; i++) {
                    doc.text(lines[i], { align: 'left' });
                    doc.moveDown();
                }
                doc.end();
                print.print(pdfPath, { printer: foundPrinter.name, sumatraPdfPath: `${process.cwd()}/resources/SumatraPDF.exe` });
            }
        } catch (error) {
            this.logger.error('Failed to print document: ', error);
        }
    }
}
