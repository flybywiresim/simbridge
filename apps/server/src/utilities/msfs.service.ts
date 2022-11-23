import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { connect } from 'net';
import { ShutDownService } from './shutdown.service';
import serverConfig from '../config/server.config';

@Injectable()
export class MsfsService {
    private msfsWasRunning = false

    constructor(
        @Inject(serverConfig.KEY) private serverConf: ConfigType<typeof serverConfig>,
        private shutdownService: ShutDownService,
    ) {
        if (this.serverConf.closeWithMSFS) {
            this.logger.log('Option "Close with MSFS" active.');
            setInterval(async () => {
                try {
                    const msfsIsRunning = await this.isRunning();
                    if (msfsIsRunning) {
                        this.msfsWasRunning = true;
                    } else if (this.msfsWasRunning) {
                        this.logger.log('MSFS closed, closing SimBridge.');
                        this.msfsWasRunning = false;
                        this.shutdownService.shutdown();
                    }
                } catch (error) {
                    this.logger.error(error);
                }
            }, 5000);
        }
    }

    private readonly logger = new Logger(MsfsService.name)

    private isRunning = async () => new Promise((resolve, reject) => {
        try {
            const socket = connect(500);
            socket.on('connect', () => {
                resolve(true);
                socket.destroy();
            });
            socket.on('error', () => {
                resolve(false);
                socket.destroy();
            });
        } catch (e) {
            reject(new Error(`Error while establishing MSFS state, see exception above: ${e}`));
        }
    })
}
