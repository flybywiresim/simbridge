import { registerAs } from '@nestjs/config';
import { getExecutablePath } from 'apps/server/src/utilities/pathUtil';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as path from 'path';

const CONFIG_FILENAME = 'resources/properties.json';

export default registerAs('server', () => {
    // @ts-ignore
    const configPath = join(getExecutablePath(), CONFIG_FILENAME);
    const properties = JSON.parse(readFileSync(configPath, 'utf8'));

    return { port: properties.server.port, hidden: properties.server.hidden, closeWithMSFS: properties.server.closeWithMSFS };
});
