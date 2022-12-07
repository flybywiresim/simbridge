import { existsSync, readFileSync } from 'fs';
import { open, Protocol, SimConnectConnection, SimConnectConstants } from 'node-simconnect';
import { userInfo } from 'os';
import { parentPort } from 'worker_threads';
import { NavigationDisplayData } from './navigationdisplaydata';

const parser = require('xml2json');

const SimConnectClientName = 'Map handling SimConnect client';

const enum ClientDataId {
    NavigationDisplayThresholds,
    NavigationDisplayFrame,
}

const NavigationDisplayThresholdByteCount = 10;

export class SimConnect {
    private simConnectPort: number = 500;

    private simConnectMaxReceiveSize: number = 16000;

    private shutdown: boolean = false;

    private connection: SimConnectConnection = null;

    private registerNavigationDisplayThresholdData(): void {
        this.connection.mapClientDataNameToID(SimConnectClientName, ClientDataId.NavigationDisplayFrame);

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
        this.connection.mapClientDataNameToID(SimConnectClientName, ClientDataId.NavigationDisplayFrame);

        this.connection.createClientData(ClientDataId.NavigationDisplayFrame, this.simConnectMaxReceiveSize, false);

        this.connection.addToClientDataDefinition(
            ClientDataId.NavigationDisplayFrame,
            SimConnectConstants.CLIENTDATAOFFSET_AUTO,
            this.simConnectMaxReceiveSize,
        );
    }

    private connectToSim() {
        if (this.shutdown) return;

        open(SimConnectClientName, Protocol.FSX_SP2, { remote: { host: 'localhost', port: this.simConnectPort } })
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

    private validateSimConnectConnectionEntry(entry: any): boolean {
        if (entry.Protocol === 'IPv4' && entry.Port !== undefined && entry.Port > 0 && entry.MaxRecvSize > 0) {
            parentPort.postMessage({
                request: 'LOGMESSAGE',
                response: `Found valid Comm-configuration. Using port ${entry.Port} with a maximum receive size of ${entry.MaxRecvSize}`,
            });

            this.simConnectPort = entry.Port;
            this.simConnectMaxReceiveSize = entry.MaxRecvSize;

            return true;
        }

        return false;
    }

    private loadSimConnectConfiguration(): void {
        const { homedir } = userInfo();

        const msStoreLocation = `${homedir}\\AppData\\Local\\Packages\\Microsoft.FlightSimulator_8wekyb3d8bbwe\\LocalCache\\SimConnect.xml`;
        const steamLocation = `${homedir}\\AppData\\Roaming\\Microsoft Flight Simulator\\SimConnect.xml`;
        let filename = null;

        if (existsSync(msStoreLocation)) {
            parentPort.postMessage({ request: 'LOGMESSAGE', response: 'MS Store version detected' });
            filename = msStoreLocation;
        } else if (existsSync(steamLocation)) {
            parentPort.postMessage({ request: 'LOGMESSAGE', response: 'Steam version detected' });
            filename = steamLocation;
        } else {
            parentPort.postMessage({ request: 'LOGMESSAGE', response: 'No SimConnect.xml file found. Trying port 500' });
            return;
        }

        const filecontent = readFileSync(filename).toString();
        const xmlContent = JSON.parse(parser.toJson(filecontent));

        if (xmlContent['SimBase.Document'] === undefined || xmlContent['SimBase.Document']['SimConnect.Comm'] === undefined) {
            parentPort.postMessage({ request: 'LOGMESSAGE', response: 'Invalid SimConnect.xml file found. Trying port 500' });
            return;
        }

        const connections = xmlContent['SimBase.Document']['SimConnect.Comm'];
        let foundValidEntry = false;
        if (Array.isArray(connections) === true) {
            connections.every((entry) => {
                foundValidEntry = this.validateSimConnectConnectionEntry(entry);
                return foundValidEntry !== true;
            });
        } else {
            foundValidEntry = this.validateSimConnectConnectionEntry(connections);
        }

        if (foundValidEntry === false) {
            parentPort.postMessage({ request: 'LOGMESSAGE', response: 'No valid Comm-configuration found. Trying port 500' });
        }
    }

    constructor() {
        this.loadSimConnectConfiguration();
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
        buffer.writeUInt16LE(thresholdData.Columns);
        buffer.writeUInt16LE(thresholdData.Rows);
        buffer.writeInt16LE(thresholdData.MinimumElevation);
        buffer.writeUInt8(thresholdData.MinimumElevationMode);
        buffer.writeInt16LE(thresholdData.MaximumElevation);
        buffer.writeUInt8(thresholdData.MaximumElevationMode);

        this.connection.setClientData(
            ClientDataId.NavigationDisplayThresholds,
            ClientDataId.NavigationDisplayThresholds,
            0,
            0,
            NavigationDisplayThresholdByteCount,
            buffer,
        );
    }

    public sendNavigationDisplayTerrainMapFrame(frame: Buffer): void {
        if (this.connection === null) return;

        // create the final buffer with the size header
        const buffer = Buffer.alloc(this.simConnectMaxReceiveSize);
        buffer.writeUInt32LE(frame.byteLength);
        Buffer.concat([buffer, frame]);

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
