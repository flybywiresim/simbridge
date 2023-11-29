import * as path from 'path';

// @ts-ignore
export const getExecutablePath = () => (process.pkg ? path.dirname(process.argv[0]) : process.cwd());
