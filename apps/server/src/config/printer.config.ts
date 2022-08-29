import { registerAs } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const CONFIG_FILENAME = 'resources/properties.json';

export default registerAs('printer', () => {
    const configPath = join(process.cwd(), CONFIG_FILENAME);
    const properties = JSON.parse(readFileSync(configPath, 'utf8'));

    return {
        enabled: properties.printer.enabled,
        printerName: properties.printer.printerName,
        fontSize: properties.printer.fontSize,
        paperSize: properties.printer.paperSize,
        margin: properties.printer.margin,
    };
});
