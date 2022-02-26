'use strict';

const path = require('path');
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack');

module.exports = () => ({
    entry: ['./apps/server/src/main.ts'],
    output: {
        path: path.join(__dirname, '../../dist/server'),
        filename: '[name].js',
        clean: true,
    },
    target: 'node',
    mode: 'none',
    devtool: 'source-map',
    externals: [
        nodeExternals(),
    ],
    externalsPresets: { node: true },
    module: {
        rules: [
            {
                test: /.tsx?$/,
                use: [{
                    loader: 'ts-loader',
                    options: { configFile: 'tsconfig.app.json' },
                }],
                exclude: /node_modules/,
            },
        ],
    },
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    plugins: [

        new webpack.HotModuleReplacementPlugin(),
    ],
});
