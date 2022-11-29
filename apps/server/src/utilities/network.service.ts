import { AddressInfo, createConnection } from 'net';
import { platform } from 'os';
import { execSync } from 'child_process';
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import * as createMDNSServer from 'multicast-dns';
import { MulticastDNS, QueryPacket } from 'multicast-dns';
import { StringAnswer } from 'dns-packet';
import { RemoteInfo } from 'dgram';

@Injectable()
export class NetworkService implements OnApplicationShutdown {
    private readonly logger = new Logger(NetworkService.name);

    private mDNSServer: MulticastDNS | undefined;

    constructor() {
        this.startMDNSServer();
    }

    async startMDNSServer() {
        const localIp = await this.getLocalIp();

        if (!localIp) {
            this.logger.warn('Couldn\'t determine local IP, mDNS server won\'t be started and simbridge.local will not be available');
            return;
        }

        this.logger.log(`Local IP is ${localIp}`);

        this.mDNSServer = createMDNSServer({
            interface: localIp,
            multicast: true,
            reuseAddr: true,
        });

        this.mDNSServer.on('error', (error) => {
            this.logger.warn(`mDNS server couldn't be started. Error: ${error.message}`);
        });

        this.mDNSServer.on('warning', (error) => {
            this.logger.warn(`mDNS server warning: ${error.message}`);
        });

        this.mDNSServer.on('ready', () => {
            this.makeAnnouncement(localIp);
        });

        this.mDNSServer.on('query', (query, client) => {
            this.onMDNSQuery(query, client);
        });
    }

    makeAnnouncement(localIp: string) {
        this.logger.log('mDNS server started, simbridge.local is available');

        // First, make two announcements, one second apart (https://www.rfc-editor.org/rfc/rfc6762.html#section-8.3)
        this.mDNSServer.respond([{
            name: 'simbridge.local',
            type: 'A',
            ttl: 1,
            flush: true,
            data: localIp,
        }]);

        setTimeout(() => {
            this.mDNSServer.respond([{
                name: 'simbridge.local',
                type: 'A',
                ttl: 1,
                flush: true,
                data: localIp,
            }]);
        }, 1000);
    }

    async onMDNSQuery(query: QueryPacket, client: RemoteInfo) {
        // TODO: Handle AAAA records (https://www.rfc-editor.org/rfc/rfc6762.html#section-6.2) or send NSEC (https://www.rfc-editor.org/rfc/rfc6762.html#section-6.1)
        if (query.questions.some((q) => q.type === 'A' && q.name === 'simbridge.local')) {
            // Make sure that the IP is always up-to-date despite DHCP shenanigans
            const localIp = await this.getLocalIp();

            if (!localIp) {
                this.logger.warn('Couldn\'t determine the local IP address, no mDNS answer will be sent');
                return;
            }

            // Whether this is a simple mDNS resolver or not (https://www.rfc-editor.org/rfc/rfc6762.html#section-6.7)
            const isSimpleResolver = client.port !== 5353;

            const answer: StringAnswer = {
                name: 'simbridge.local',
                type: 'A',
                ttl: isSimpleResolver ? 10 : 120,
                data: localIp,
            };

            if (isSimpleResolver) {
                // Simple resolvers require the ID and questions be included in the response, and the response to be sent via unicast
                const response = {
                    id: query.id,
                    questions: query.questions,
                    answers: [answer],
                };

                this.mDNSServer.respond(response, client);
            } else {
                const response = { answers: [answer] };

                this.mDNSServer.respond(response);
            }
        }
    }

    /**
     * Get the local (LAN) IP address of the computer. By default it creates a TCP connection to api.flybywire.com:443
     * but has fallbacks for Windows and Linux in case internet connection is not available.
     * @param defaultToLocalhost Returns 'localhost' in case the IP address couldn't be determined, instead of undefined
     * @returns the local IP address, undefined or 'localhost'
     */
    async getLocalIp(defaultToLocalhost = false): Promise<string | undefined> {
        return new Promise<string | undefined>((resolve) => {
            const conn = createConnection({ host: 'api.flybywiresim.com', port: 443, timeout: 1000 })
                .on('connect', () => {
                    resolve((conn.address() as AddressInfo).address);
                })
                .on('timeout', () => {
                    resolve(this.getLocalIpFallback(defaultToLocalhost));
                })
                .on('error', () => {
                    resolve(this.getLocalIpFallback(defaultToLocalhost));
                });
        });
    }

    onApplicationShutdown(_signal?: string) {
        this.logger.log(`Destroying ${NetworkService.name}`);

        if (this.mDNSServer) {
            this.mDNSServer.destroy();
        }
    }

    private getLocalIpFallback(defaultToLocalhost = true) {
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

        if (platform() === 'win32') {
            let lines: string[];
            try {
                lines = execSync('route print 0.0.0.0', { encoding: 'utf-8', stdio: 'pipe' }).split('\n');
            } catch (e) {
                this.logger.warn(`Couldn't execute \`route\`. This is probably a bug. Details: ${e.stderr.trim()}`);
            }

            for (const [i, line] of lines.entries()) {
                if (line.startsWith('Network Destination')) {
                    const ip = lines[i + 1].trim().split(' ').filter((p) => p !== '')[3].trim();

                    if (ipv4Regex.test(ip)) {
                        return ip;
                    }
                }
            }
        } else if (platform() === 'linux') {
            /** Example output:
             *  > 1.0.0.0 via 172.20.96.1 dev eth0 src 172.20.108.184 uid 1000
             *  > cache
             */
            let parts: string[];
            try {
                parts = execSync('ip -4 route get to 1', { encoding: 'utf-8', stdio: 'pipe' }).split('\n')[0].split(' ');
            } catch (e) {
                this.logger.warn(`Couldn't execute \`ip\`. Make sure the \`iproute2\` (or equivalent) package is installed. Details: '${e.stderr.trim()}'`);
            }

            const ip = parts[parts.indexOf('src') + 1].trim();

            if (ipv4Regex.test(ip)) {
                return ip;
            }
        }

        if (defaultToLocalhost) {
            return 'localhost';
        }

        return undefined;
    }
}
