import {
    ClientDataArea,
    ClientDataOffsetAuto,
    ClientDataMaxSize,
    Connection,
    ErrorMessage,
    ExceptionMessage,
    OpenMessage,
    Receiver,
    SimulatorDataArea,
    SimulatorDataType,
    SimulatorDataPeriod,
    SimulatorDataRequestMessage,
    ClientDataRequestMessage,
    ClientDataPeriod,
    ClientDataRequest,
} from '@flybywiresim/msfs-nodejs';
import { parentPort } from 'worker_threads';
import { NavigationDisplayData } from '../processing/navigationdisplaydata';
import { AircraftStatus, PositionData, TerrainRenderingMode } from './types';

export type UpdateCallbacks = {
    positionUpdate: (data: PositionData) => void;
    aircraftStatusUpdate: (data: AircraftStatus) => void;
}

const SimConnectClientName = 'FBW_SIMBRIDGE_SIMCONNECT';

const enum SimulatorDataId {
    AircraftPosition = 0,
}

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

const EnhancedGpwcAircraftStatusByteCount = 48;
const NavigationDisplayThresholdByteCount = 14;

export class SimConnect {
    private callbacks: UpdateCallbacks = {
        positionUpdate: null,
        aircraftStatusUpdate: null,
    };

    private shutdown: boolean = false;

    private connection: Connection = null;

    private receiver: Receiver = null;

    private simulatorData: SimulatorDataArea = null;

    private egpwcAircraftStatus: ClientDataArea = null;

    private frameMetadataLeft: ClientDataArea = null;

    private frameMetadataRight: ClientDataArea = null;

    private frameDataLeft: ClientDataArea = null;

    private frameDataRight: ClientDataArea = null;

    private registerEgpwcAircraftStatus(): void {
        this.egpwcAircraftStatus = new ClientDataArea(this.connection, ClientDataId.EnhancedGpwcAircraftStatus);
        this.egpwcAircraftStatus.mapNameToId('FBW_SIMBRIDGE_EGPWC_AIRCRAFT_STATUS');
        this.egpwcAircraftStatus.addDataDefinition({
            definitionId: DataDefinitionId.EnhancedGpwcAircraftStatus,
            offset: ClientDataOffsetAuto,
            sizeOrType: EnhancedGpwcAircraftStatusByteCount,
            epsilon: 0,
            memberName: 'AircraftStatus',
        });
    }

    private registerNavigationDisplayMetadata(clientId: ClientDataId, mapName: string, dataDefinitionId: DataDefinitionId): ClientDataArea {
        const metadata = new ClientDataArea(this.connection, clientId);
        metadata.mapNameToId(mapName);

        const addedDefinition = metadata.addDataDefinition({
            definitionId: dataDefinitionId,
            offset: ClientDataOffsetAuto,
            sizeOrType: NavigationDisplayThresholdByteCount,
            epsilon: 0.0,
            memberName: 'ThresholdData',
        });
        if (addedDefinition === false) {
            parentPort.postMessage({ request: 'LOGERROR', response: `Unable to create the data definitions: ${this.connection.lastError()}` });
        }

        metadata.allocateArea(NavigationDisplayThresholdByteCount, true);

        if (metadata === null) {
            parentPort.postMessage({ request: 'LOGERROR', response: `Unable to create the threshold client data area: ${this.connection.lastError()}` });
        }

        return metadata;
    }

    private registerNavigationDisplayData(): boolean {
        this.frameDataLeft = new ClientDataArea(this.connection, ClientDataId.NavigationDisplayFrameLeft);
        this.frameDataLeft.mapNameToId('FBW_SIMBRIDGE_TERRONND_FRAME_DATA_LEFT');
        let addedDefinition = this.frameDataLeft.addDataDefinition({
            definitionId: DataDefinitionId.NavigationDisplayFrameAreaLeft,
            offset: ClientDataOffsetAuto,
            sizeOrType: ClientDataMaxSize,
            epsilon: 0,
            memberName: 'FrameData',
        });
        this.frameDataLeft.allocateArea(ClientDataMaxSize, true);

        this.frameDataRight = new ClientDataArea(this.connection, ClientDataId.NavigationDisplayFrameRight);
        this.frameDataRight.mapNameToId('FBW_SIMBRIDGE_TERRONND_FRAME_DATA_RIGHT');
        addedDefinition = this.frameDataRight.addDataDefinition({
            definitionId: DataDefinitionId.NavigationDisplayFrameAreaRight,
            offset: ClientDataOffsetAuto,
            sizeOrType: ClientDataMaxSize,
            epsilon: 0,
            memberName: 'FrameData',
        });
        this.frameDataRight.allocateArea(ClientDataMaxSize, true);

        if (!addedDefinition) {
            parentPort.postMessage({ request: 'LOGERROR', response: `Unable to create the frame client data area: ${this.connection.lastError()}` });
        }

        return addedDefinition;
    }

    private registerSimulatorData(): boolean {
        this.simulatorData = new SimulatorDataArea(this.connection, SimulatorDataId.AircraftPosition);

        let addedDefinition = this.simulatorData.addDataDefinition({
            type: SimulatorDataType.Float64,
            name: 'PLANE LATITUDE',
            unit: 'DEGREES',
            memberName: 'latitude',
        });
        addedDefinition = this.simulatorData.addDataDefinition({
            type: SimulatorDataType.Float64,
            name: 'PLANE LONGITUDE',
            unit: 'DEGREES',
            memberName: 'longitude',
        });

        if (!addedDefinition) {
            parentPort.postMessage({ request: 'LOGERROR', response: `Unable to create the simulation data area: ${this.simulatorData.lastError()}` });
        }

        return addedDefinition;
    }

    private simConnectOpen(message: OpenMessage): void {
        parentPort.postMessage({
            request: 'LOGMESSAGE',
            response: `Connected to ${message.application.name} - v${message.application.version.major}.${message.application.version.minor}`,
        });

        if (this.receiver !== null && this.simulatorData !== null) {
            this.receiver.requestSimulatorData(this.simulatorData, SimulatorDataPeriod.Second);
            this.receiver.requestClientData(this.egpwcAircraftStatus, ClientDataPeriod.Second, ClientDataRequest.Default);
        }
    }

    private resetConnection(): void {
        this.receiver.stop();
        this.receiver = null;
        this.frameMetadataLeft = null;
        this.frameMetadataRight = null;
        this.frameDataLeft = null;
        this.frameDataRight = null;
        this.simulatorData = null;
        this.connection.close();
    }

    private simConnectQuit(): void {
        this.resetConnection();
        parentPort.postMessage({ request: 'LOGMESSAGE', response: 'Received a quit signal. Trying to reconnect...' });
        parentPort.postMessage({ request: 'SIMCONNECT_QUIT', response: undefined });

        this.connectToSim();
    }

    private simConnectError(message: ErrorMessage): void {
        if (message !== null) {
            console.log(`Error: ${message.id}`);
        } else {
            console.log('Invalid error');
        }
    }

    private simConnectException(message: ExceptionMessage): void {
        console.log(`Exception: ${message.exception} ${message.sendId} ${message.index}`);
        console.log(message.exceptionText);
    }

    // Rust stores some values defragmented
    private static readDefragmentedFloat(buffer: Buffer, indices: [number, number, number, number]): number {
        const temporaryBuffer = new Uint8Array(4);
        for (let i = 0; i < 4; ++i) {
            temporaryBuffer[i] = buffer.at(indices[i]);
        }
        return Buffer.from(temporaryBuffer).readFloatLE(0);
    }

    private simConnectReceivedClientData(message: ClientDataRequestMessage): void {
        if (message.clientDataId === ClientDataId.EnhancedGpwcAircraftStatus) {
            const entry = Object.entries(message.content)[0];
            const data = entry[1] as ArrayBuffer;
            const buffer = Buffer.from(data);

            // offsets are found based on an reverse engineering of transmitted data
            const status: AircraftStatus = {
                adiruDataValid: buffer.readUInt16LE(34) !== 0,
                latitude: SimConnect.readDefragmentedFloat(buffer, [28, 29, 0, 1]),
                longitude: buffer.readFloatLE(2),
                altitude: buffer.readInt32LE(6),
                heading: buffer.readInt16LE(40),
                verticalSpeed: buffer.readInt16LE(20),
                gearIsDown: buffer.readUInt8(42) !== 0,
                destinationDataValid: buffer.readUInt8(43) !== 0,
                destinationLatitude: SimConnect.readDefragmentedFloat(buffer, [10, 11, 30, 31]),
                destinationLongitude: SimConnect.readDefragmentedFloat(buffer, [32, 33, 38, 39]),
                navigationDisplayCapt: {
                    range: buffer.readUInt16LE(22),
                    arcMode: buffer.readUInt8(24) !== 0,
                    active: buffer.readUInt8(25) !== 0,
                    brightness: buffer.readFloatLE(12),
                },
                navigationDisplayFO: {
                    range: buffer.readUInt16LE(36),
                    arcMode: buffer.readUInt8(26) !== 0,
                    active: buffer.readUInt8(27) !== 0,
                    brightness: buffer.readFloatLE(16),
                },
                navigationDisplayRenderingMode: buffer.readUInt8(buffer.readUInt8(45)) as TerrainRenderingMode,
            };

            if (this.callbacks.aircraftStatusUpdate !== null) {
                this.callbacks.aircraftStatusUpdate(status);
            }
        }
    }

    private simConnectReceivedSimulatorData(message: SimulatorDataRequestMessage): void {
        if (message.definitionId === SimulatorDataId.AircraftPosition && this.callbacks.positionUpdate !== null) {
            this.callbacks.positionUpdate(message.content as PositionData);
        }
    }

    private connectToSim() {
        if (this.shutdown) return;

        this.connection = new Connection();
        if (this.connection.open(SimConnectClientName) === false) {
            parentPort.postMessage({ request: 'LOGERROR', response: `Connection failed: ${this.connection.lastError()} - Retry in 10 seconds` });
            setTimeout(() => this.connectToSim(), 10000);
            return;
        }

        if (this.receiver !== null) this.receiver.stop();
        this.receiver = new Receiver(this.connection);
        this.receiver.addCallback('open', (message: OpenMessage) => this.simConnectOpen(message));
        this.receiver.addCallback('quit', () => this.simConnectQuit());
        this.receiver.addCallback('simulatorData', (message: SimulatorDataRequestMessage) => this.simConnectReceivedSimulatorData(message));
        this.receiver.addCallback('clientData', (message: ClientDataRequestMessage) => this.simConnectReceivedClientData(message));
        this.receiver.addCallback('exception', (message: ExceptionMessage) => this.simConnectException(message));
        this.receiver.addCallback('error', (message: ErrorMessage) => this.simConnectError(message));
        this.receiver.start();

        this.registerEgpwcAircraftStatus();
        this.frameMetadataLeft = this.registerNavigationDisplayMetadata(
            ClientDataId.NavigationDisplayMetdataLeft,
            'FBW_SIMBRIDGE_TERRONND_METADATA_LEFT',
            DataDefinitionId.NavigationDisplayMetadataAreaLeft,
        );
        this.frameMetadataRight = this.registerNavigationDisplayMetadata(
            ClientDataId.NavigationDisplayMetdataRight,
            'FBW_SIMBRIDGE_TERRONND_METADATA_RIGHT',
            DataDefinitionId.NavigationDisplayMetadataAreaRight,
        );
        const createdSimulatorData = this.registerSimulatorData();
        if (this.frameMetadataLeft === null || this.frameMetadataRight === null || this.registerNavigationDisplayData() === false || createdSimulatorData === false) {
            this.receiver.stop();
            this.connection.close();
            setTimeout(() => this.connectToSim(), 10000);
        }
    }

    constructor() {
        this.connectToSim();
    }

    public terminate(): void {
        this.receiver.stop();
        this.connection.close();
    }

    public sendNavigationDisplayTerrainMapMetadata(side: string, metadata: NavigationDisplayData): void {
        if (this.connection === null || !this.connection.isConnected()) return;

        const packed = Buffer.alloc(NavigationDisplayThresholdByteCount);
        packed.writeInt16LE(metadata.ImageWidth, 0);
        packed.writeInt16LE(metadata.ImageHeight, 2);
        packed.writeInt16LE(metadata.MinimumElevation, 4);
        packed.writeUInt8(metadata.MinimumElevationMode, 6);
        packed.writeInt16LE(metadata.MaximumElevation, 7);
        packed.writeUInt8(metadata.MaximumElevationMode, 9);
        packed.writeUInt32LE(metadata.FrameByteCount, 10);

        if (side === 'L') {
            if (this.frameMetadataLeft.setData({ ThresholdData: packed.buffer }) === false) {
                parentPort.postMessage({ request: 'LOGERROR', response: `Could not send metadata: ${this.frameMetadataLeft.lastError()}` });
            }
        } else if (this.frameMetadataRight.setData({ ThresholdData: packed.buffer }) === false) {
            parentPort.postMessage({ request: 'LOGERROR', response: `Could not send metadata: ${this.frameMetadataRight.lastError()}` });
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
                    parentPort.postMessage({ request: 'LOGERROR', response: `Could not send frame data: ${this.frameDataLeft.lastError()}` });
                }
            } else if (this.frameDataRight.setData({ FrameData: stream.buffer }) === false) {
                parentPort.postMessage({ request: 'LOGERROR', response: `Could not send frame data: ${this.frameDataRight.lastError()}` });
            }
        }
    }

    public addUpdateCallback<K extends keyof UpdateCallbacks>(event: K, callback: UpdateCallbacks[K]): void {
        this.callbacks[event] = callback;
    }
}
