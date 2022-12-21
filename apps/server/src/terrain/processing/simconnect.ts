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
} from '@flybywiresim/msfs-nodejs';
import { parentPort } from 'worker_threads';
import { NavigationDisplayData } from './navigationdisplaydata';
import { PositionDto } from '../dto/position.dto';

const SimConnectClientName = 'FBW_SIMBRIDGE_SIMCONNECT';

const enum SimulatorDataId {
    AircraftPosition = 0,
}

const enum ClientDataId {
    NavigationDisplayMetdataLeft = 0,
    NavigationDisplayMetdataRight = 1,
    NavigationDisplayFrameLeft = 2,
    NavigationDisplayFrameRight = 3,
}

const enum DataDefinitionId {
    NavigationDisplayMetadataAreaLeft = 0,
    NavigationDisplayMetadataAreaRight = 1,
    NavigationDisplayFrameAreaLeft = 2,
    NavigationDisplayFrameAreaRight = 3,
}

const NavigationDisplayThresholdByteCount = 14;

export class SimConnect {
    private shutdown: boolean = false;

    private connection: Connection = null;

    private receiver: Receiver = null;

    private simulatorData: SimulatorDataArea = null;

    private frameMetadataLeft: ClientDataArea = null;

    private frameMetadataRight: ClientDataArea = null;

    private frameDataLeft: ClientDataArea = null;

    private frameDataRight: ClientDataArea = null;

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
        addedDefinition = this.frameDataLeft.addDataDefinition({
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
            name: 'PLANE ALTITUDE',
            unit: 'FEET',
            memberName: 'altitude',
        });
        addedDefinition = this.simulatorData.addDataDefinition({
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
        addedDefinition = this.simulatorData.addDataDefinition({
            type: SimulatorDataType.Float64,
            name: 'VERTICAL SPEED',
            unit: 'FEET PER MINUTE',
            memberName: 'verticalSpeed',
        });
        addedDefinition = this.simulatorData.addDataDefinition({
            type: SimulatorDataType.Float64,
            name: 'PLANE HEADING DEGREES TRUE',
            unit: 'DEGREES',
            memberName: 'heading',
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
        }
    }

    private simConnectQuit(): void {
        this.receiver.stop();
        this.receiver = null;
        this.frameMetadataLeft = null;
        this.frameMetadataRight = null;
        this.frameDataLeft = null;
        this.frameDataRight = null;
        this.simulatorData = null;
        this.connection.close();

        parentPort.postMessage({ request: 'LOGMESSAGE', response: 'Received a quit signal. Trying to reconnect...' });

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

    private simConnectReceivedSimulatorData(message: SimulatorDataRequestMessage): void {
        if (message.definitionId === SimulatorDataId.AircraftPosition) {
            parentPort.postMessage({ request: 'SIMOBJECT_POSITION', response: message.content as PositionDto });
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
        this.receiver.addCallback('exception', (message: ExceptionMessage) => this.simConnectException(message));
        this.receiver.addCallback('error', (message: ErrorMessage) => this.simConnectError(message));
        this.receiver.start();

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
}
