import getPath from 'platform-folders';
import * as path from 'path';
import { Logger } from '@nestjs/common';

export const getSimbridgeDir = () => {
  try {
    return path.join(getPath('documents'), 'FlyByWireSim', 'Simbridge');
  } catch (e) {
    Logger.warn(
      'Could not get documents path via WinAPI, Windows Controlled Folder Access is likely blocking the app. Using AppData as fallback',
      e,
    );
  }
  try {
    return path.join(getPath('appdata'), 'FlyByWireSim', 'Simbridge');
  } catch (e) {
    Logger.error('Could not get AppData path via WinAPI. Giving up.', e);
  }
};

//@ts-expect-error pkg only defined when running as exe
export const getExecutablePath = () => (process.pkg ? path.dirname(process.argv[0]) : process.cwd());
