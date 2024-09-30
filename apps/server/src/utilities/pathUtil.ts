import { homedir } from 'os'
import * as path from 'path';

export const getSimbridgeDir = () => (path.join(homedir() + '/flybywire-externaltools-simbridge'));

//@ts-expect-error pkg only defined when running as exe
export const getExecutablePath = () => (process.pkg ? path.dirname(process.argv[0]) : process.cwd());
