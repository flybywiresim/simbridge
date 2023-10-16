import * as path from 'path';

// @ts-ignore
export const getCurrentPath = () => (process.pkg ? path.dirname(process.argv[0]) : process.cwd());
