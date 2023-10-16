import { registerAs } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as path from 'path';

const CONFIG_FILENAME = 'resources/properties.json';

export default registerAs('printer', () => {
    // @ts-ignore
    const configPath = join(process.pkg ? path.dirname(process.argv[0]) : process.cwd(), CONFIG_FILENAME);
    const properties = JSON.parse(readFileSync(configPath, 'utf8'));

    return {
        enabled: properties.printer.enabled,
        printerName: properties.printer.printerName,
        fontSize: properties.printer.fontSize,
        paperSize: properties.printer.paperSize,
        margin: properties.printer.margin,
    };
});
