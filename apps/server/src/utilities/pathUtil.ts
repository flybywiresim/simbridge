import getPath from 'platform-folders';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { homedir } from 'os';
import { execFileSync } from "child_process";

export const getSimbridgeDir = () => {
   try {
     return path.join(getPath('documents'), 'FlyByWireSim', 'Simbridge');
   } catch (e) {
    Logger.warn("Could not get documents path via WinAPI, trying alternate method");
   }
   try {
    const { stdout } = execFileSync("Powershell.exe", [
      "-Command",
      `[System.Environment]::GetFolderPath('MyDocuments')`,
    ]);
    const path = stdout.trim();
    if(!path) {
        throw new Error("Path is empty");
    }
    return path;
  } catch (error) {
    Logger.warn("Could not get documents path via Powershell, trying to use %USERPROFILE% method");
  }

  return path.join(homedir(), "Documents");
}

//@ts-expect-error pkg only defined when running as exe
export const getExecutablePath = () => (process.pkg ? path.dirname(process.argv[0]) : process.cwd());
