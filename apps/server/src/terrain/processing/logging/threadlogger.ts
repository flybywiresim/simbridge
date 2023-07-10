import { parentPort } from 'worker_threads';
import { Logger as ProcessingLogger } from './logger';
import { WorkerToMainThreadMessageTypes } from '../../types';

export class ThreadLogger implements ProcessingLogger {
    constructor() {}

    public info(message: string): void {
        parentPort.postMessage({ type: WorkerToMainThreadMessageTypes.LogInfo, content: message });
    }

    public warn(message: string): void {
        parentPort.postMessage({ type: WorkerToMainThreadMessageTypes.LogWarn, content: message });
    }

    public error(message: string): void {
        parentPort.postMessage({ type: WorkerToMainThreadMessageTypes.LogError, content: message });
    }
}
