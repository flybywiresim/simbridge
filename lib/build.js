/* eslint-disable strict */

const { execSync } = require('child_process');
const pkg = require('pkg');

exports.build = async function (package, output) {
    console.log(`Building server executable with package: ${package} and output: ${output} `);
    execSync('nest build');
    await pkg.exec(['dist/main.js', '--public-packages', '*', '-t', `${package}`, '--output', `${output}`]);
};
