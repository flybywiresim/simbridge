import { open, Protocol, SimConnectConnection, SimConnectConstants } from 'node-simconnect';
import { parentPort } from 'worker_threads';
import { NavigationDisplayData } from './navigationdisplaydata';

export interface SimConnectParameters {
    maxNavigationDisplayWidth: number,
    maxNavigationDisplayHeight: number,
    colorChannelCount: number,
}

const enum ClientDataId {
    NavigationDisplayThresholds = 1000,
    NavigationDisplayFrame = 1001,
}

const NavigationDisplayThresholdByteCount = 10;

export class SimConnect {
    private parameters: SimConnectParameters = null;

    private shutdown: boolean = false;

    private connection: SimConnectConnection = null;

    private registerNavigationDisplayThresholdData(): void {
        // see data definition below for byte count
        this.connection.createClientData(ClientDataId.NavigationDisplayFrame, NavigationDisplayThresholdByteCount, false);

        // image width
        this.connection.addToClientDataDefinition(
            ClientDataId.NavigationDisplayThresholds,
            SimConnectConstants.CLIENTDATAOFFSET_AUTO,
            SimConnectConstants.CLIENT_DATA_TYPE_INT16,
        );
        // image height
        this.connection.addToClientDataDefinition(
            ClientDataId.NavigationDisplayThresholds,
            SimConnectConstants.CLIENTDATAOFFSET_AUTO,
            SimConnectConstants.CLIENT_DATA_TYPE_INT16,
        );

        // lowest elevation
        this.connection.addToClientDataDefinition(
            ClientDataId.NavigationDisplayThresholds,
            SimConnectConstants.CLIENTDATAOFFSET_AUTO,
            SimConnectConstants.CLIENT_DATA_TYPE_INT16,
        );
        // lowest elevation mode
        this.connection.addToClientDataDefinition(
            ClientDataId.NavigationDisplayThresholds,
            SimConnectConstants.CLIENTDATAOFFSET_AUTO,
            SimConnectConstants.CLIENT_DATA_TYPE_INT8,
        );

        // highest elevation
        this.connection.addToClientDataDefinition(
            ClientDataId.NavigationDisplayThresholds,
            SimConnectConstants.CLIENTDATAOFFSET_AUTO,
            SimConnectConstants.CLIENT_DATA_TYPE_INT16,
        );
        // highest elevation mode
        this.connection.addToClientDataDefinition(
            ClientDataId.NavigationDisplayThresholds,
            SimConnectConstants.CLIENTDATAOFFSET_AUTO,
            SimConnectConstants.CLIENT_DATA_TYPE_INT8,
        );
    }

    private registerNavigationDisplayData(): void {
        const byteCount = this.parameters.maxNavigationDisplayHeight * this.parameters.maxNavigationDisplayWidth * this.parameters.colorChannelCount;
        this.connection.createClientData(ClientDataId.NavigationDisplayFrame, byteCount, false);

        for (let i = 0; i < byteCount; i++) {
            this.connection.addToClientDataDefinition(
                ClientDataId.NavigationDisplayFrame,
                SimConnectConstants.CLIENTDATAOFFSET_AUTO,
                SimConnectConstants.CLIENT_DATA_TYPE_INT8,
            );
        }
    }

    private connectToSim() {
        if (this.shutdown) return;

        open('Map handling SimConnect client', Protocol.FSX_SP2, { remote: { host: 'localhost', port: 500 } })
            .then(({ recvOpen, handle }) => {
                parentPort.postMessage({ request: 'LOGMESSAGE', response: `Connected to ${recvOpen.applicationName}` });
                this.connection = handle;

                this.registerNavigationDisplayThresholdData();
                this.registerNavigationDisplayData();

                this.connection.on('quit', () => {
                    parentPort.postMessage({ request: 'LOGMESSAGE', response: 'Simulator quit!' });

                    if (this.connection !== null) this.connection.close();
                    this.connection = null;

                    this.connectToSim();
                });
                this.connection.on('close', () => {
                    parentPort.postMessage({ request: 'LOGMESSAGE', response: 'Connection closed unexpectedly!' });

                    if (this.connection !== null) this.connection.close();
                    this.connection = null;

                    this.connectToSim();
                });
            })
            .catch((error) => {
                parentPort.postMessage({ request: 'LOGMESSAGE', response: `Connection failed: ${error} - Retry in 10 seconds` });
                setTimeout(() => this.connectToSim(), 10000);
            });
    }

    constructor(parameters: SimConnectParameters) {
        this.parameters = parameters;
        this.connectToSim();
    }

    public terminate(): void {
        this.shutdown = true;
        if (this.connection !== null) this.connection.close();
        this.connection = null;
    }

    public sendNavigationDisplayThresholds(thresholdData: NavigationDisplayData): void {
        if (this.connection === null) return;

        const buffer = Buffer.alloc(NavigationDisplayThresholdByteCount);

        // fill the buffer
        buffer.writeInt16LE(thresholdData.Columns);
        buffer.writeInt16LE(thresholdData.Rows);
        buffer.writeInt16LE(thresholdData.MinimumElevation);
        buffer.writeInt8(thresholdData.MinimumElevationMode);
        buffer.writeInt16LE(thresholdData.MaximumElevation);
        buffer.writeInt8(thresholdData.MaximumElevationMode);

        this.connection.setClientData(
            ClientDataId.NavigationDisplayThresholds,
            ClientDataId.NavigationDisplayThresholds,
            0,
            0,
            NavigationDisplayThresholdByteCount,
            buffer,
        );
    }

    public sendNavigationDisplayTerrainMapFrame(frame: Uint8ClampedArray): void {
        if (this.connection === null) return;

        const byteCount = this.parameters.maxNavigationDisplayHeight * this.parameters.maxNavigationDisplayWidth * this.parameters.colorChannelCount;
        const buffer = Buffer.alloc(byteCount, 0);

        frame.forEach((entry) => buffer.writeInt8(entry));

        this.connection.setClientData(
            ClientDataId.NavigationDisplayFrame,
            ClientDataId.NavigationDisplayFrame,
            0,
            0,
            buffer.byteLength,
            buffer,
        );
    }
}
