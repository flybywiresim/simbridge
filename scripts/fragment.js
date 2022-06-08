const fragmenter = require('@flybywiresim/fragmenter');
const fs = require('fs');

const execute = async () => {
    try {
        const result = await fragmenter.pack({
            baseDir: './build',
            outDir: './build-modules',
            modules: [
                {
                    name: 'resources',
                    sourceDir: './resources',
                },
                {
                    name: 'dependencies',
                    sourceDir: './node_modules',
                },
                {
                    name: 'traybin',
                    sourceDir: './traybin',
                },
                {
                    name: 'terrain',
                    sourceDir: './terrain',
                },
            ],
        });
        console.log(result);
        console.log(fs.readFileSync('./build-modules/modules.json').toString());
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

execute();
