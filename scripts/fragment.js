const fragmenter = require('@flybywiresim/fragmenter');
const fs = require('fs');

const execute = async () => {
  try {
    const result = await fragmenter.pack({
      version: require('./fragmenter_version').version,
      baseDir: './build',
      outDir: './build-modules',
      packOptions: { splitFileSize: 102_760_448, keepCompleteModulesAfterSplit: false },
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
