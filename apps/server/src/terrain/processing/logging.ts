import { parentPort } from 'worker_threads';

export class Logging {
    static info(message: string): void {
        parentPort.postMessage({ request: 'LOGMESSAGE', response: message });
    }

    static warn(message: string): void {
        parentPort.postMessage({ request: 'LOGWARN', response: message });
    }

    static error(message: string): void {
        parentPort.postMessage({ request: 'LOGERROR', response: message });
    }
}
