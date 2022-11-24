import { Injectable, Logger, Inject, OnApplicationShutdown } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { hideConsole, showConsole } from 'node-hide-console-window';
import open = require('open');
import SysTray, { MenuItem } from 'systray2';
import { join } from 'path';
import { IpService } from './ip.service';
import serverConfig from '../config/server.config';
import { ShutDownService } from './shutdown.service';

interface MenuItemClickable extends MenuItem {
    click?: () => void;
    items?: MenuItemClickable[];
}

@Injectable()
export class SysTrayService implements OnApplicationShutdown {
    constructor(
        @Inject(serverConfig.KEY)
        private serverConf: ConfigType<typeof serverConfig>,
        private ipService: IpService,
        private shutdownService: ShutDownService,
    ) {
        this.sysTray = new SysTray({
            menu: {
                icon: join(__dirname, '/../assets/images/tail.ico'),
                title: 'FBW SimBridge',
                tooltip: 'Flybywire SimBridge',
                items: [
                    this.remoteDisplayItem,
                    this.resourcesFolderItem,
                    this.consoleVisibleItem,
                    this.exitItem,
                ],
            },
            copyDir: false,
        });

        this.sysTray.onClick((action) => {
            // eslint-disable-next-line no-prototype-builtins
            if (action.item.hasOwnProperty('click')) {
                const item = action.item as MenuItemClickable;
                item.click();
            }
        });
    }

    private readonly logger = new Logger(SysTrayService.name);

    private sysTray: SysTray;

    private hidden = this.serverConf.hidden

    private remoteDisplayItem: MenuItemClickable = {
        title: 'Remote Displays',
        tooltip: 'Open remote displays',
        items: [{
            title: 'Open MCDU',
            tooltip: 'Open the MCDU remote display with your default browser, using your local IP',
            enabled: true,
            click: async () => {
                open(`http://${await this.ipService.getLocalIp()}:${this.serverConf.port}/interfaces/mcdu`);
            },
        }],
    };

    private resourcesFolderItem: MenuItemClickable = {
        title: 'Open Resources Folder',
        tooltip: 'Open resource folder in your file explorer',
        enabled: true,
        click: () => {
            open.openApp('explorer', { arguments: [`${process.cwd()}\\resources`] });
        },
    };

    private exitItem: MenuItemClickable = {
        title: 'Exit',
        tooltip: 'Kill the server',
        checked: false,
        enabled: true,
        click: () => {
            this.logger.log('Exiting via Tray', 'Systems Tray');
            this.shutdownService.shutdown();
        },
    };

    private consoleVisibleItem: MenuItemClickable = {
        title: 'Show/Hide',
        tooltip: 'Change console visibility',
        checked: false,
        enabled: true,
        click: () => this.manageConsole(),

    };

    private manageConsole() {
        if (this.hidden) showConsole();
        else hideConsole();
        this.hidden = !this.hidden;
    }

    onApplicationShutdown(signal?: string) {
        this.logger.log(`Shutdown signal: ${signal} received, Shutting down Systray Service`);
        this.sysTray.kill(false);
    }
}
