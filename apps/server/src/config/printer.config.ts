import { registerAs } from '@nestjs/config';
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';

const CONFIG_FILENAME = 'resources/properties.yml';

export default registerAs('printer', () => {
    const properties = yaml.load(readFileSync(`${process.cwd()}/${CONFIG_FILENAME}`, 'utf8')) as Record<string, any>;

    return {
        enabled: properties.printer.enabled,
        printerName: properties.printer.printerName,
        fontSize: properties.printer.fontSize,
        paperSize: properties.printer.paperSize,
        margin: properties.printer.margin,
    };
});
