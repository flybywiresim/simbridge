// build.js
import exe from '@angablue/exe';

const build = exe({
  entry: './dist/main.js',
  out: './build/fbw-simbridge.exe',
  version: '0.5.5',
  icon: './apps/server/src/assets/images/tail.ico',
  properties: {
    FileDescription: 'fbw-simbridge',
    ProductName: 'FlyByWire Simbridge',
    LegalCopyright: 'https://flybywiresim.com/',
    OriginalFilename: 'fbw-simbridge.exe',
  },
});

build.then(() => console.log('Build completed!'));
