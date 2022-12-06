import { open, Protocol, SimConnectConnection } from 'node-simconnect';

export class SimConnect {
    private shutdown: boolean = false;

    private connection: SimConnectConnection = null;

    private connectToSim() {
        if (this.shutdown) return;

        open('Map handling SimConnect client', Protocol.FSX_SP2, { remote: { host: 'localhost', port: 5111 } })
            .then(({ recvOpen, handle }) => {
                console.log(`Connected to ${recvOpen.applicationName}`);
                this.connection = handle;

                this.connection.on('quit', () => {
                    console.log('Simulator quit!');

                    if (this.connection !== null) this.connection.close();
                    this.connection = null;

                    this.connectToSim();
                });
                this.connection.on('close', () => {
                    console.log('Connection closed unexpectedly!');

                    if (this.connection !== null) this.connection.close();
                    this.connection = null;

                    this.connectToSim();
                });
            })
            .catch((error) => {
                console.log(`Connection failed: ${error} - Retry in 5 seconds`);
                setTimeout(() => this.connectToSim(), 5000);
            });
    }

    constructor() {
        this.connectToSim();
    }

    public terminate(): void {
        this.shutdown = true;
        if (this.connection !== null) this.connection.close();
        this.connection = null;
    }
}
