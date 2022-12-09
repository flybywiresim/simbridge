import {
    ClientData,
    ClientDataDefinition,
    ClientDataOffsetAuto,
    ClientDataType,
    Connection,
} from '@devfs/msfs-nodejs';
import { parentPort } from 'worker_threads';
import { NavigationDisplayData } from './navigationdisplaydata';

const SimConnectClientName = 'FBW_SIMBRIDGE_SIMCONNECT';

const enum ClientDataId {
    NavigationDisplayThresholds = 1000,
    NavigationDisplayFrame = 1001,
}

const NavigationDisplayThresholdByteCount = 10;
const NavigationDisplayImageBufferSize = 40000;

export class SimConnect {
    private simConnectMaxReceiveSize: number = 16000;

    private shutdown: boolean = false;

    private connection: Connection = null;

    private thresholdData: ClientData = null;

    private imageData: ClientData = null;

    private registerNavigationDisplayThresholdData(): void {
        ClientData.create(
            'FBW_SIMBRIDGE_TERRONND_THRESHOLDS',
            ClientDataId.NavigationDisplayThresholds,
            NavigationDisplayThresholdByteCount,
            false,
        ).then((data) => {
            // image dimensions (width, height)
            data.addDataDefinition(new ClientDataDefinition(
                ClientDataId.NavigationDisplayThresholds,
                ClientDataOffsetAuto,
                ClientDataType.Int16,
            ));
            data.addDataDefinition(new ClientDataDefinition(
                ClientDataId.NavigationDisplayThresholds,
                ClientDataOffsetAuto,
                ClientDataType.Int16,
            ));

            // lowest elevation and mode
            data.addDataDefinition(new ClientDataDefinition(
                ClientDataId.NavigationDisplayThresholds,
                ClientDataOffsetAuto,
                ClientDataType.Int16,
            ));
            data.addDataDefinition(new ClientDataDefinition(
                ClientDataId.NavigationDisplayThresholds,
                ClientDataOffsetAuto,
                ClientDataType.Int8,
            ));

            // highest elevation and mode
            data.addDataDefinition(new ClientDataDefinition(
                ClientDataId.NavigationDisplayThresholds,
                ClientDataOffsetAuto,
                ClientDataType.Int16,
            ));
            data.addDataDefinition(new ClientDataDefinition(
                ClientDataId.NavigationDisplayThresholds,
                ClientDataOffsetAuto,
                ClientDataType.Int8,
            ));

            this.thresholdData = data;
        }).catch((error) => {
            parentPort.postMessage({ request: 'LOGERROR', response: `Unable to create the threshold client data: ${error}` });
            throw error;
        });
    }

    private registerNavigationDisplayData(): void {
        ClientData.create(
            'FBW_SIMBRIDGE_TERRONND_IMAGE',
            ClientDataId.NavigationDisplayFrame,
            NavigationDisplayImageBufferSize,
            false,
        ).then((data) => {
            // image dimensions (width, height)
            data.addDataDefinition(new ClientDataDefinition(
                ClientDataId.NavigationDisplayThresholds,
                ClientDataOffsetAuto,
                NavigationDisplayImageBufferSize,
            ));

            this.imageData = data;
        }).catch((error) => {
            parentPort.postMessage({ request: 'LOGERROR', response: `Unable to create the image client data: ${error}` });
            throw error;
        });
    }

    private connectToSim() {
        if (this.shutdown) return;

        this.connection = new Connection();
        this.connection.open(SimConnectClientName).then(() => {
            this.registerNavigationDisplayThresholdData();
            this.registerNavigationDisplayData();
            console.log('created data');
        }).catch((error) => {
            this.connection.close();
            this.connection = null;

            parentPort.postMessage({ request: 'LOGERROR', response: `Connection failed: ${error} - Retry in 10 seconds` });
            setTimeout(() => this.connectToSim(), 10000);
        });
    }

    constructor() {
        this.connectToSim();
    }

    public terminate(): void {
        this.connection.close();
    }

    public sendNavigationDisplayThresholds(thresholdData: NavigationDisplayData): void {
        if (this.connection === null) return;

        const buffer = Buffer.alloc(NavigationDisplayThresholdByteCount);

        // fill the buffer
        buffer.writeUInt16LE(thresholdData.Columns, 0);
        buffer.writeUInt16LE(thresholdData.Rows, 2);
        buffer.writeInt16LE(thresholdData.MinimumElevation, 4);
        buffer.writeUInt8(thresholdData.MinimumElevationMode, 6);
        buffer.writeInt16LE(thresholdData.MaximumElevation, 7);
        buffer.writeUInt8(thresholdData.MaximumElevationMode, 9);

        this.thresholdData.setData(ClientDataId.NavigationDisplayThresholds, buffer);
    }

    public sendNavigationDisplayTerrainMapFrame(frame: Buffer): void {
        if (this.connection === null) return;

        // create the final buffer with the size header
        const buffer = Buffer.alloc(this.simConnectMaxReceiveSize);
        buffer.writeUInt32LE(frame.byteLength);
        Buffer.concat([buffer, frame]);

        /* this.connection.setClientData(
            ClientDataId.NavigationDisplayFrame,
            ClientDataId.NavigationDisplayFrame,
            0,
            0,
            buffer.byteLength,
            buffer,
        ); */
    }
}
