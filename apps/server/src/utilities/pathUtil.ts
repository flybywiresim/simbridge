import getPath from 'platform-folders';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { homedir } from 'os';
import { execFileSync } from 'child_process';

export const getSimbridgeDir = () => {
  try {
    return path.join(getPath('documents'), 'FlyByWireSim', 'Simbridge');
  } catch (e) {
    Logger.warn('Could not get documents path via WinAPI, trying alternate method', e);
  }
  try {
    const output = execFileSync('Powershell.exe', ['-Command', `[System.Environment]::GetFolderPath('MyDocuments')`]);
    const documents = output.toString().trim();
    if (!documents) {
      throw new Error('Path is empty');
    }
    return path.join(documents, 'FlyByWireSim', 'Simbridge');
  } catch (e) {
    Logger.warn('Could not get documents path via Powershell, trying to use %USERPROFILE% method', e);
  }

  return path.join(homedir(), 'Documents', 'FlyByWireSim', 'Simbridge');
};

//@ts-expect-error pkg only defined when running as exe
export const getExecutablePath = () => (process.pkg ? path.dirname(process.argv[0]) : process.cwd());
