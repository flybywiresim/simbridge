import { AddressInfo, createConnection } from 'net';
import { networkInterfaces } from 'os';

export class IpService {
    async getLocalIp(): Promise<string> {
        return new Promise<string>((resolve) => {
        // It's hard to reliably find the local IP so we try using 2 different methods.
        // First, we try to connect to api.flybywiresim.com:443 and see if we can extract the IP
        // from the socket connection.
            const conn = createConnection({ host: 'api.flybywiresim.com', port: 443, timeout: 1000 });

            conn.on('connect', () => {
                resolve((conn.address() as AddressInfo).address);
            });

            conn.on('error', () => {
                conn.destroy();

                // If the connection fails for whatever reason, we query the list of network interfaces
                // and try to get the IP from there.
                for (const interfaces of Object.values(networkInterfaces())) {
                    for (const iface of interfaces) {
                        if (iface.family !== 'IPv4') {
                            continue;
                        }

                        const parts = iface.address.split('.');

                        if (parts[0] === '10' // 10.0.0.0/8
                            || (parts[0] === '192' && parts[1] === '168') // 192.168.0.0/16
                        ) {
                            resolve(iface.address);
                        }
                    }
                }

                resolve('localhost');
            });
        });
    }
}
