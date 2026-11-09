import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getSimbridgeDir } from '../utilities/pathUtil';

export const defaultProperties = {
  server: {
    port: 8380,
    hidden: true,
    closeWithMSFS: false,
  },
  printer: {
    enabled: false,
    printerName: null as string | null,
    fontSize: 19,
    paperSize: 'A4',
    margin: 30,
  },
};

let properties: typeof defaultProperties;

// Both configuration factories must use the same startup snapshot, including on failure.
export function loadProperties(): typeof defaultProperties {
  if (properties) return properties;

  const configPath = join(getSimbridgeDir(), 'resources', 'properties.json');
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a configuration object');
    }
    for (const section of ['server', 'printer']) {
      if (
        parsed[section] !== undefined &&
        (!parsed[section] || typeof parsed[section] !== 'object' || Array.isArray(parsed[section]))
      ) {
        throw new Error(`Expected an object for configuration section "${section}"`);
      }
    }
    properties = {
      server: { ...defaultProperties.server, ...parsed.server },
      printer: { ...defaultProperties.printer, ...parsed.printer },
    };
  } catch (error) {
    const details = ['code', 'errno', 'syscall', 'path']
      .filter((key) => error?.[key] !== undefined)
      .map((key) => `${key}=${JSON.stringify(error[key])}`)
      .join(', ');
    Logger.warn(
      `Could not load configuration from "${configPath}": ${error}${details ? ` (${details})` : ''}. ` +
        'Using default settings (port 8380, printing disabled). The existing file will not be overwritten.',
      'Configuration',
    );
    properties = {
      server: { ...defaultProperties.server },
      printer: { ...defaultProperties.printer },
    };
  }

  return properties;
}
