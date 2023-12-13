import * as path from 'path';

// @ts-expect-error I don't know why
export const getExecutablePath = () => (process.pkg ? path.dirname(process.argv[0]) : process.cwd());
