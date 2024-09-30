import { homedir } from 'os'
import * as path from 'path';

export const getSimbridgeDir = () => (path.join(homedir() + '/flybywire-externaltools-simbridge'));
