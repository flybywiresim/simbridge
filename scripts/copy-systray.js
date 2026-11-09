const { copyFileSync, mkdirSync } = require('fs');
const { dirname, join, resolve } = require('path');

const systrayPackagePath = require.resolve('systray2/package.json');
const { version } = require(systrayPackagePath);
const targetDir = resolve(__dirname, '..', 'build', version);

// systray2 reuses this file when present, avoiding fs.copyFile from SEA's virtual filesystem.
mkdirSync(targetDir, { recursive: true });
copyFileSync(
  join(dirname(systrayPackagePath), 'traybin', 'tray_windows_release.exe'),
  join(targetDir, 'tray_windows_release.exe'),
);
