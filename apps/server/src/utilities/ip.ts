import { networkInterfaces } from 'os';

/**
 * Returns the private (usually 192.168.x.x) IP of the computer.
 */
export function getPrivateIp() {
    for (const interfaces of Object.values(networkInterfaces())) {
        for (const iface of interfaces) {
            if (iface.family !== 'IPv4') {
                continue;
            }

            const parts = iface.address.split('.');

            // Determine whether the given IPv4 address is a part of a private netowrk.
            // Source: https://en.wikipedia.org/wiki/Private_network#Private_IPv4_addresses
            if (parts[0] === '10' // 10.0.0.0/8
                || (parts[0] === '172' && parts[1] >= '16' && parts[1] <= '31') // 172.16.0.0/12
                || (parts[0] === '192' && parts[1] === '168') // 192.168.0.0/16
            ) {
                return iface.address;
            }
        }
    }

    return null;
}
