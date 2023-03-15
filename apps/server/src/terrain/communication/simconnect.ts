import {
    ClientDataArea,
    ClientDataOffsetAuto,
    ClientDataMaxSize,
    Connection,
    ErrorMessage,
    ExceptionMessage,
    OpenMessage,
    Receiver,
    ClientDataRequestMessage,
    ClientDataPeriod,
    ClientDataRequest,
} from '@flybywiresim/msfs-nodejs';
import { Logger } from '../processing/logging/logger';
import { NavigationDisplayData } from '../processing/navigationdisplaydata';
import { AircraftStatus, PositionData, TerrainRenderingMode } from './types';

export type UpdateCallbacks = {
    connectionLost: () => void;
    positionUpdate: (data: PositionData) => void;
    aircraftStatusUpdate: (data: AircraftStatus) => void;
}

const SimConnectClientName = 'FBW_SIMBRIDGE_SIMCONNECT';

const enum ClientDataId {
    EnhancedGpwcAircraftStatus = 0,
    NavigationDisplayMetdataLeft = 1,
    NavigationDisplayMetdataRight = 2,
    NavigationDisplayFrameLeft = 3,
    NavigationDisplayFrameRight = 4,
}

const enum DataDefinitionId {
    EnhancedGpwcAircraftStatus = 0,
    NavigationDisplayMetadataAreaLeft = 1,
    NavigationDisplayMetadataAreaRight = 2,
    NavigationDisplayFrameAreaLeft = 3,
    NavigationDisplayFrameAreaRight = 4,
}

const EnhancedGpwcAircraftStatusByteCount = 46;
const NavigationDisplayThresholdByteCount = 11;

export class SimConnect {
    private callbacks: UpdateCallbacks = {
        connectionLost: null,
        positionUpdate: null,
        aircraftStatusUpdate: null,
    };

    private shutdown: boolean = false;

    private connection: Connection = null;

    private receiver: Receiver = null;

    private egpwcAircraftStatus: ClientDataArea = null;

    private frameMetadataLeft: ClientDataArea = null;

    private frameMetadataRight: ClientDataArea = null;

    private frameDataLeft: ClientDataArea = null;

    private frameDataRight: ClientDataArea = null;

    private registerEgpwcAircraftStatus(): boolean {
        this.egpwcAircraftStatus = new ClientDataArea(this.connection, ClientDataId.EnhancedGpwcAircraftStatus);
        if (!this.egpwcAircraftStatus.mapNameToId('FBW_SIMBRIDGE_EGPWC_AIRCRAFT_STATUS')) {
            this.logging.error(`Unable to map aircraft status: ${this.egpwcAircraftStatus.lastError()}`);
            return false;
        }

        const addedDefinition = this.egpwcAircraftStatus.addDataDefinition({
            definitionId: DataDefinitionId.EnhancedGpwcAircraftStatus,
            offset: ClientDataOffsetAuto,
            sizeOrType: EnhancedGpwcAircraftStatusByteCount,
            epsilon: 0,
            memberName: 'AircraftStatus',
        });
        if (!addedDefinition) {
            this.logging.error(`Unable to define aircraft status data: ${this.egpwcAircraftStatus.lastError()}`);
        }

        return addedDefinition;
    }

    private registerNavigationDisplayMetadata(clientId: ClientDataId, mapName: string, dataDefinitionId: DataDefinitionId): ClientDataArea {
        const metadata = new ClientDataArea(this.connection, clientId);
        if (!metadata.mapNameToId(mapName)) {
            this.logging.error(`Unable to map data for ${mapName}: ${metadata.lastError()}`);
        }

        const addedDefinition = metadata.addDataDefinition({
            definitionId: dataDefinitionId,
            offset: ClientDataOffsetAuto,
            sizeOrType: NavigationDisplayThresholdByteCount,
            epsilon: 0.0,
            memberName: 'ThresholdData',
        });
        if (addedDefinition === false) {
            this.logging.error(`Unable to create the data definitions for ${mapName}: ${this.connection.lastError()}`);
            return null;
        }

        if (!metadata.allocateArea(NavigationDisplayThresholdByteCount, true)) {
            this.logging.error(`Unable to create the threshold client data area for ${mapName}: ${this.connection.lastError()}`);
            return null;
        }

        return metadata;
    }

    private registerNavigationDisplayData(): boolean {
        this.frameDataLeft = new ClientDataArea(this.connection, ClientDataId.NavigationDisplayFrameLeft);
        if (!this.frameDataLeft.mapNameToId('FBW_SIMBRIDGE_TERRONND_FRAME_DATA_LEFT')) {
            this.logging.error(`Unable to map data for FBW_SIMBRIDGE_TERRONND_FRAME_DATA_LEFT: ${this.frameDataLeft.lastError()}`);
            return false;
        }

        let addedDefinition = this.frameDataLeft.addDataDefinition({
            definitionId: DataDefinitionId.NavigationDisplayFrameAreaLeft,
            offset: ClientDataOffsetAuto,
            sizeOrType: ClientDataMaxSize,
            epsilon: 0,
            memberName: 'FrameData',
        });
        if (!addedDefinition) {
            this.logging.error(`Unable to add data definition for FBW_SIMBRIDGE_TERRONND_FRAME_DATA_LEFT: ${this.frameDataLeft.lastError()}`);
            return false;
        }

        if (!this.frameDataLeft.allocateArea(ClientDataMaxSize, true)) {
            this.logging.error(`Unable to allocate data for FBW_SIMBRIDGE_TERRONND_FRAME_DATA_LEFT: ${this.frameDataLeft.lastError()}`);
            return false;
        }

        this.frameDataRight = new ClientDataArea(this.connection, ClientDataId.NavigationDisplayFrameRight);
        if (!this.frameDataRight.mapNameToId('FBW_SIMBRIDGE_TERRONND_FRAME_DATA_RIGHT')) {
            this.logging.error(`Unable to map data for FBW_SIMBRIDGE_TERRONND_FRAME_DATA_RIGHT: ${this.frameDataRight.lastError()}`);
            return false;
        }

        addedDefinition = this.frameDataRight.addDataDefinition({
            definitionId: DataDefinitionId.NavigationDisplayFrameAreaRight,
            offset: ClientDataOffsetAuto,
            sizeOrType: ClientDataMaxSize,
            epsilon: 0,
            memberName: 'FrameData',
        });
        if (!addedDefinition) {
            this.logging.error(`Unable to add data definition for FBW_SIMBRIDGE_TERRONND_FRAME_DATA_RIGHT: ${this.frameDataRight.lastError()}`);
            return false;
        }

        if (!this.frameDataRight.allocateArea(ClientDataMaxSize, true)) {
            this.logging.error(`Unable to allocate data for FBW_SIMBRIDGE_TERRONND_FRAME_DATA_RIGHT: ${this.frameDataRight.lastError()}`);
            return false;
        }

        return true;
    }

    private simConnectOpen(_message: OpenMessage): void {
        if (this.receiver !== null) {
            if (!this.receiver.requestClientData(this.egpwcAircraftStatus, ClientDataPeriod.OnSet, ClientDataRequest.Default)) {
                this.logging.error('Unable to request aircraft status data');
            }
        }
    }

    private resetConnection(): void {
        this.receiver.stop();
        this.receiver = null;
        this.frameMetadataLeft = null;
        this.frameMetadataRight = null;
        this.frameDataLeft = null;
        this.frameDataRight = null;
        this.connection.close();
    }

    private simConnectQuit(): void {
        if (this.callbacks.connectionLost !== null) {
            this.callbacks.connectionLost();
        }

        this.resetConnection();
        this.logging.info('Received a quit signal. Trying to reconnect...');

        this.connectToSim();
    }

    private simConnectError(message: ErrorMessage): void {
        if (message !== null) {
            console.log(`Error: ${message.id}`);
        } else {
            console.log('Invalid error');
        }
    }

    private simConnectException(_message: ExceptionMessage): void {
        this.resetConnection();
        setTimeout(() => this.connectToSim(), 10000);
    }

    private simConnectReceivedClientData(message: ClientDataRequestMessage): void {
        if (message.clientDataId === ClientDataId.EnhancedGpwcAircraftStatus) {
            const entry = Object.entries(message.content)[0];
            const data = entry[1] as ArrayBuffer;
            const buffer = Buffer.from(data);

            if (this.callbacks.positionUpdate !== null) {
                const positionData: PositionData = {
                    latitude: buffer.readFloatLE(38),
                    longitude: buffer.readFloatLE(42),
                };

                this.callbacks.positionUpdate(positionData);
            }

            if (this.callbacks.aircraftStatusUpdate !== null) {
                const status: AircraftStatus = {
                    adiruDataValid: buffer.readUInt8(0) !== 0,
                    latitude: buffer.readFloatLE(1),
                    longitude: buffer.readFloatLE(5),
                    altitude: buffer.readInt32LE(9),
                    heading: buffer.readInt16LE(13),
                    verticalSpeed: buffer.readInt16LE(15),
                    gearIsDown: buffer.readUInt8(17) !== 0,
                    destinationDataValid: buffer.readUInt8(18) !== 0,
                    destinationLatitude: buffer.readFloatLE(19),
                    destinationLongitude: buffer.readFloatLE(23),
                    navigationDisplayCapt: {
                        range: buffer.readUInt16LE(27),
                        arcMode: buffer.readUInt8(29) !== 0,
                        active: buffer.readUInt8(30) !== 0,
                        efisMode: buffer.readUInt8(31),
                    },
                    navigationDisplayFO: {
                        range: buffer.readUInt16LE(32),
                        arcMode: buffer.readUInt8(34) !== 0,
                        active: buffer.readUInt8(35) !== 0,
                        efisMode: buffer.readUInt8(36),
                    },
                    navigationDisplayRenderingMode: buffer.readUInt8(37) as TerrainRenderingMode,
                };

                this.callbacks.aircraftStatusUpdate(status);
            }
        }
    }

    private connectToSim() {
        if (this.shutdown) return;

        this.connection = new Connection();
        if (this.connection.open(SimConnectClientName) === false) {
            this.logging.error(`Connection failed: ${this.connection.lastError()} - Retry in 10 seconds`);
            setTimeout(() => this.connectToSim(), 10000);
            return;
        }

        if (this.receiver !== null) this.receiver.stop();
        this.receiver = new Receiver(this.connection);
        this.receiver.addCallback('open', (message: OpenMessage) => this.simConnectOpen(message));
        this.receiver.addCallback('quit', () => this.simConnectQuit());
        this.receiver.addCallback('clientData', (message: ClientDataRequestMessage) => this.simConnectReceivedClientData(message));
        this.receiver.addCallback('exception', (message: ExceptionMessage) => this.simConnectException(message));
        this.receiver.addCallback('error', (message: ErrorMessage) => this.simConnectError(message));
        this.receiver.start();

        if (!this.registerEgpwcAircraftStatus()) {
            setTimeout(() => this.resetConnection(), 10000);
            return;
        }

        this.frameMetadataLeft = this.registerNavigationDisplayMetadata(
            ClientDataId.NavigationDisplayMetdataLeft,
            'FBW_SIMBRIDGE_TERRONND_THRESHOLDS_LEFT',
            DataDefinitionId.NavigationDisplayMetadataAreaLeft,
        );
        if (this.frameMetadataLeft === null) {
            setTimeout(() => this.connectToSim(), 10000);
            return;
        }

        this.frameMetadataRight = this.registerNavigationDisplayMetadata(
            ClientDataId.NavigationDisplayMetdataRight,
            'FBW_SIMBRIDGE_TERRONND_THRESHOLDS_RIGHT',
            DataDefinitionId.NavigationDisplayMetadataAreaRight,
        );
        if (this.frameMetadataRight === null) {
            setTimeout(() => this.connectToSim(), 10000);
            return;
        }

        if (!this.registerNavigationDisplayData()) {
            this.receiver.stop();
            this.connection.close();
            setTimeout(() => this.connectToSim(), 10000);
        }
    }

    constructor(private logging: Logger) {
        this.connectToSim();
    }

    public terminate(): void {
        if (this.receiver !== null) this.receiver.stop();
        if (this.connection !== null) this.connection.close();
    }

    public sendNavigationDisplayTerrainMapMetadata(side: string, metadata: NavigationDisplayData): void {
        if (this.connection === null || !this.connection.isConnected()) return;

        const packed = Buffer.alloc(NavigationDisplayThresholdByteCount);
        packed.writeInt16LE(metadata.MinimumElevation, 0);
        packed.writeUInt8(metadata.MinimumElevationMode, 2);
        packed.writeInt16LE(metadata.MaximumElevation, 3);
        packed.writeUInt8(metadata.MaximumElevationMode, 5);
        packed.writeUInt8(metadata.FirstFrame ? 1 : 0, 6);
        packed.writeUInt32LE(metadata.FrameByteCount, 7);

        if (side === 'L') {
            if (this.frameMetadataLeft.setData({ ThresholdData: packed.buffer }) === false) {
                this.logging.error(`Could not send metadata: ${this.frameMetadataLeft.lastError()}`);
            }
        } else if (this.frameMetadataRight.setData({ ThresholdData: packed.buffer }) === false) {
            this.logging.error(`Could not send metadata: ${this.frameMetadataRight.lastError()}`);
        }
    }

    public sendNavigationDisplayTerrainMapFrame(side: string, frame: Buffer): void {
        if (this.connection === null || !this.connection.isConnected()) return;

        // calculate the size
        const chunks = Math.ceil(frame.byteLength / ClientDataMaxSize);
        const stream = Buffer.alloc(ClientDataMaxSize);

        for (let i = 0; i < chunks; ++i) {
            // copy over the remaining data
            const remaining = frame.byteLength - i * ClientDataMaxSize;
            const byteCount = remaining >= ClientDataMaxSize ? ClientDataMaxSize : remaining;
            frame.copy(stream, 0, i * ClientDataMaxSize, i * ClientDataMaxSize + byteCount);

            // send the data
            if (side === 'L') {
                if (this.frameDataLeft.setData({ FrameData: stream.buffer }) === false) {
                    this.logging.error(`Could not send frame data: ${this.frameDataLeft.lastError()}`);
                }
            } else if (this.frameDataRight.setData({ FrameData: stream.buffer }) === false) {
                this.logging.error(`Could not send frame data: ${this.frameDataRight.lastError()}`);
            }
        }
    }

    public addUpdateCallback<K extends keyof UpdateCallbacks>(event: K, callback: UpdateCallbacks[K]): void {
        this.callbacks[event] = callback;
    }
}
