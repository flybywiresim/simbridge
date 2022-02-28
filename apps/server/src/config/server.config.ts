import { registerAs } from '@nestjs/config';
import { readFileSync } from 'fs';

const CONFIG_FILENAME = 'resources/properties.json';

export default registerAs('server', () => {
    const properties = JSON.parse(readFileSync(`${process.cwd()}/${CONFIG_FILENAME}`, 'utf8'));

    return { port: properties.server.port };
});
