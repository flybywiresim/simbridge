import { registerAs } from '@nestjs/config';
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';

const CONFIG_FILENAME = 'resources/properties.yml';

export default registerAs('server', () => {
    const properties = yaml.load(readFileSync(`${process.cwd()}/${CONFIG_FILENAME}`, 'utf8')) as Record<string, any>;

    return { port: properties.server.port };
});
