import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exec } from '@yao-pkg/pkg';
import * as ResEdit from 'resedit';

process.chdir(fileURLToPath(new URL('.', import.meta.url)));

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
const output = './build/fbw-simbridge.exe';

// Enhanced SEA preserves native ESM while packaging dependencies, assets, and workers.
await exec([
  './scripts/exe-entry.js',
  '--sea',
  '--compress',
  'GZip',
  '--config',
  './package.json',
  '--targets',
  packageJson.pkg.targets.join(','),
  '--output',
  output,
]);

const executable = ResEdit.NtExecutable.from(readFileSync(output), { ignoreCert: true });
const resources = ResEdit.NtExecutableResource.from(executable);
const versionInfo = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)[0];
const language = { lang: 1033, codepage: 1200 };
const [major, minor, patch] = packageJson.version.split('.').map(Number);

versionInfo.setFileVersion(major, minor, patch, 0, language.lang);
versionInfo.setProductVersion(major, minor, patch, 0, language.lang);
versionInfo.setStringValues(language, {
  CompanyName: 'FlyByWire Simulations',
  FileDescription: 'fbw-simbridge',
  ProductName: 'FlyByWire Simbridge',
  LegalCopyright: 'https://flybywiresim.com/',
  InternalName: 'fbw-simbridge',
  OriginalFilename: 'fbw-simbridge.exe',
});
versionInfo.outputToResourceEntries(resources.entries);

const icon = ResEdit.Data.IconFile.from(readFileSync('./apps/server/src/assets/images/tail.ico'));
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
  resources.entries,
  1,
  language.lang,
  icon.icons.map((item) => item.data),
);

resources.outputResource(executable);
writeFileSync(output, Buffer.from(executable.generate()));
console.log(`Built ${output} (${packageJson.version}) using @yao-pkg/pkg and Node SEA.`);
