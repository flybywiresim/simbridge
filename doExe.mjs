// build.js
import exe from '@angablue/exe';

const build = exe({
    entry: './dist/main.js',
    out: './build/fbw-simbridge.exe',
    pkg: ['-C', 'GZip', '-c', './package.json'], // Specify extra pkg arguments
    version: '0.4.4',
    target: 'node18-win-x64',
    icon: './apps/server/src/assets/images/tail.ico', // Application icons must be in .ico format
    properties: {
        FileDescription: 'fbw-simbridge',
        ProductName: 'fbw-simbridge',
        LegalCopyright: 'https://flybywiresim.com/',
        OriginalFilename: 'fbw-simbridge.exe',
    },
});

build.then(() => console.log('Build completed!'));
