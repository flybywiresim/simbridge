import { registerAs } from '@nestjs/config';
import { getExecutablePath } from 'apps/server/src/utilities/pathUtil';
import { readFileSync } from 'fs';
import { join } from 'path';

const CONFIG_FILENAME = 'resources/properties.json';

export default registerAs('printer', () => {
  const configPath = join(getExecutablePath(), CONFIG_FILENAME);
  const properties = JSON.parse(readFileSync(configPath, 'utf8'));

  return {
    enabled: properties.printer.enabled,
    printerName: properties.printer.printerName,
    fontSize: properties.printer.fontSize,
    paperSize: properties.printer.paperSize,
    margin: properties.printer.margin,
  };
});
