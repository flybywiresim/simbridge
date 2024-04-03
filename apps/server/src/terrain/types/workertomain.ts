import { WorkerToMainThreadMessageTypes } from './messagetypes';

export interface WorkerToMainThreadMessage {
  type: WorkerToMainThreadMessageTypes;
  content?: any;
}
