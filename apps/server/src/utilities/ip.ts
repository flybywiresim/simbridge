import { networkInterfaces } from 'os';

/**
 * Returns the private IP (usually 192.168.x.x) of the computer, or `null` if none is found.
 *
 * There's no reliable way to get the private/local IP of the computer, so a heuristic is used
 * which is not perfect and may return false positives for unusual network configurations.
 */
export function getPrivateIp() {
    for (const interfaces of Object.values(networkInterfaces())) {
        for (const iface of interfaces) {
            if (iface.family !== 'IPv4') {
                continue;
            }

            const parts = iface.address.split('.');

            // Heuristic based on private IPv4 address ranges (https://en.wikipedia.org/wiki/Private_network).
            // 172.16.0.0/12 is excluded because it seems to be often used by services such as Docker or Hyper-V.
            if (parts[0] === '10' // 10.0.0.0/8
                || (parts[0] === '192' && parts[1] === '168') // 192.168.0.0/16
            ) {
                return iface.address;
            }
        }
    }

    return null;
}
