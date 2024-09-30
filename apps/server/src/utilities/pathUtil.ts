import getPath from 'platform-folders';
import * as path from 'path';

export const getSimbridgeDir = () => path.join(getPath('documents'), 'FlyByWireSim', 'Simbridge');

//@ts-expect-error pkg only defined when running as exe
export const getExecutablePath = () => (process.pkg ? path.dirname(process.argv[0]) : process.cwd());
