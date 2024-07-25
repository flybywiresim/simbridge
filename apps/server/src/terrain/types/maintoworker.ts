import { MainToWorkerThreadMessageTypes } from './messagetypes';

export interface MainToWorkerThreadMessage {
  type: MainToWorkerThreadMessageTypes;
  content?: any;
}
