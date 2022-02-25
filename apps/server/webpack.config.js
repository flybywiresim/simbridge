'use strict';

const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
    entry: ['webpack/hot/poll?100', './apps/server/src/main.ts'],
    output: {
        path: path.join(__dirname, '../../dist/server'),
        filename: 'server.js',
        clean: true,
    },
    target: 'node',
    externals: [
        nodeExternals({ allowlist: ['webpack/hot/poll?100'] }),
    ],
    module: {
        rules: [
            {
                test: /.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    mode: 'development',
};
