/* eslint-disable strict */

const pkg = require('pkg');

exports.build = async function (output) {
    console.log(`Building server executable with output: ${output} `);
    await pkg.exec(['main.js', '--public-packages', '*', '--output', `${output}`]);
};
