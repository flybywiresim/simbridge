import { Injectable, Logger } from '@nestjs/common';
import { hideConsole, showConsole } from 'node-hide-console-window';
import open = require('open');
import SysTray, { MenuItem } from 'systray2';
import { join } from 'path';
import { getPrivateIp } from './ip';

interface MenuItemClickable extends MenuItem {
    click?: () => void;
    items?: MenuItemClickable[];
}

@Injectable()
export class SysTrayService {
  private readonly logger = new Logger(SysTrayService.name);

  private sysTray;

  init(isConsoleHidden: boolean, port) {
      let hidden = isConsoleHidden;

      const manageConsole = () => {
          if (hidden) showConsole();
          else hideConsole();
          hidden = !hidden;
      };

      const remoteDisplayItem: MenuItemClickable = {
          title: 'Remote Displays',
          tooltip: 'Open remote displays',
          items: [{
              title: 'Open MCDU',
              tooltip: 'Open the MCDU remote display with your default browser',
              enabled: true,
              click: () => {
                  open(`http://${getPrivateIp()}:${port}/interfaces/mcdu`);
              },
          }],
      };

      const resourcesFolderItem: MenuItemClickable = {
          title: 'Open Resources Folder',
          tooltip: 'Open resource folder in your file explorer',
          enabled: true,
          click: () => {
              open.openApp('explorer', { arguments: [`${process.cwd()}\\resources`] });
          },
      };

      const exitItem: MenuItemClickable = {
          title: 'Exit',
          tooltip: 'Kill the server',
          checked: false,
          enabled: true,
          click: () => {
              this.logger.log('Exiting via Tray', 'Systems Tray');
              this.sysTray.kill(true);
          },
      };

      const consoleVisibleItem: MenuItemClickable = {
          title: 'Show/Hide',
          tooltip: 'Change console visibility',
          checked: false,
          enabled: true,
          click: () => manageConsole(),
      };

      this.sysTray = new SysTray({
          menu: {
              icon: join(__dirname, '/../assets/images/tail.ico'),
              title: 'FBW SimBridge',
              tooltip: 'Flybywire SimBridge',
              items: [
                  remoteDisplayItem,
                  resourcesFolderItem,
                  consoleVisibleItem,
                  exitItem,
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

  kill() {
      this.sysTray.kill();
  }
}
