import { registerAs } from '@nestjs/config';
import { readFileSync } from 'fs';
import path from 'path';

const CONFIG_FILENAME = 'resources/properties.json';

export default registerAs('printer', () => {
    const properties = JSON.parse(readFileSync(path.join(process.cwd(), CONFIG_FILENAME), 'utf8'));

    return {
        enabled: properties.printer.enabled,
        printerName: properties.printer.printerName,
        fontSize: properties.printer.fontSize,
        paperSize: properties.printer.paperSize,
        margin: properties.printer.margin,
    };
});
