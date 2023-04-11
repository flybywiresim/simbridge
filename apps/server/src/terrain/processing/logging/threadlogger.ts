import { parentPort } from 'worker_threads';
import { Logger as ProcessingLogger } from './logger';

export class ThreadLogger implements ProcessingLogger {
    constructor() {}

    public info(message: string): void {
        parentPort.postMessage({ request: 'LOGINFO', content: message });
    }

    public warn(message: string): void {
        parentPort.postMessage({ request: 'LOGWARN', content: message });
    }

    public error(message: string): void {
        parentPort.postMessage({ request: 'LOGERROR', content: message });
    }
}
