export enum MainToWorkerThreadMessageTypes {
    Unknown = '',
    Shutdown = 'REQ_SHUTDOWN',
    FrameData = 'REQ_FRAME_DATA',
}

export enum WorkerToMainThreadMessageTypes {
    Unknown = '',
    FrameData = 'RES_FRAME_DATA',
    LogInfo = 'LOGINFO',
    LogWarn = 'LOGWARN',
    LogError = 'LOGERROR',
}
