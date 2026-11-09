import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { join } from 'path';
import { tmpdir, platform } from 'os';
import * as print from 'pdf-to-printer';
import PDFDocument = require('pdfkit');
import { createWriteStream, readFileSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { getExecutablePath } from './pathUtil';
import printerConfig from '../config/printer.config';

@Injectable()
export class PrinterService {
  constructor(@Inject(printerConfig.KEY) private printerConf: ConfigType<typeof printerConfig>) {}

  private readonly logger = new Logger(PrinterService.name);

  private selectedPrinter = this.selectPrinter();

  private fontBuffer = readFileSync(join(__dirname, '..', 'assets/fonts/RobotoMono-Bold.ttf'));

  private async selectPrinter() {
    if (platform() !== 'win32') {
      this.logger.warn(`Incorrect platform for printer: ${platform}, please use win32`);
      return null;
    }
    try {
      const printers = await print.getPrinters();
      if (!printers) {
        this.logger.error('No printers detected');
        return null;
      }
      printers.map((printer) => printer.name === this.printerConf.printerName);

      this.logger.log(`Current Printers: ${printers.map((printer) => printer.name)}`);

      if (this.printerConf.enabled && this.printerConf.printerName !== null) {
        const foundPrinter = printers.find((printer) => printer.name === this.printerConf.printerName);
        if (foundPrinter) {
          return foundPrinter;
        }
        this.logger.error(`Printer selected: ${this.printerConf.printerName} does not match found printers`);
        return null;
      }
      this.logger.warn('Printer disabled or null printerName');
      return null;
    } catch (error) {
      this.logger.error(`Error retrieving printers list: ${error}`, error);
      return null;
    }
  }

  async print(lines: any) {
    let tempDirectory: string;
    try {
      const foundPrinter = await this.selectedPrinter;
      if (foundPrinter) {
        tempDirectory = await mkdtemp(join(tmpdir(), 'a32nxPrint-'));
        const doc = new PDFDocument({ size: this.printerConf.paperSize, margin: this.printerConf.margin });
        const pdfPath = join(tempDirectory, 'a32nxPrint.pdf');

        doc.font(this.fontBuffer);
        doc.fontSize(this.printerConf.fontSize);
        for (let i = 0; i < lines.length; i++) {
          doc.text(lines[i], { align: 'left' });
          doc.moveDown();
        }
        doc.end();
        // Wait for the complete PDF and the file handle to close before launching Sumatra.
        await pipeline(doc, createWriteStream(pdfPath));
        await print.print(pdfPath, {
          printer: foundPrinter.name,
          sumatraPdfPath: `${getExecutablePath()}/resources/SumatraPDF.exe`,
        });
      }
    } catch (error) {
      this.logger.error('Error printing document', error);
    } finally {
      if (tempDirectory) {
        try {
          await rm(tempDirectory, { recursive: true, force: true });
        } catch (error) {
          this.logger.error('Error removing temporary print document', error);
        }
      }
    }
  }
}
