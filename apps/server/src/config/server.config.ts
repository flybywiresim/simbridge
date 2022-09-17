import { registerAs } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const CONFIG_FILENAME = 'resources/properties.json';

export default registerAs('server', () => {
    const configPath = join(process.cwd(), CONFIG_FILENAME);
    const properties = JSON.parse(readFileSync(configPath, 'utf8'));

    return { port: properties.server.port, hidden: properties.server.hidden };
});
