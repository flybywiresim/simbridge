import { registerAs } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as path from 'path';

const CONFIG_FILENAME = 'resources/properties.json';

export default registerAs('server', () => {
    // @ts-ignore
    const configPath = join(process.pkg ? path.dirname(process.argv[0]) : process.cwd(), CONFIG_FILENAME);
    const properties = JSON.parse(readFileSync(configPath, 'utf8'));

    return { port: properties.server.port, hidden: properties.server.hidden, closeWithMSFS: properties.server.closeWithMSFS };
});
