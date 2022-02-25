'use strict';

const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;

module.exports = (_env, _argv) => ({
    mode: 'development',
    devtool: 'inline-source-map',
    entry: ['./apps/mcdu/src/index.jsx'],
    output: {
        path: path.join(__dirname, '../../dist/mcdu'),
        filename: 'index.js',
        clean: true,
    },
    module: {
        rules: [
            // JSX Files
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        cacheDirectory: true,
                        cacheCompression: false,
                        envName: 'development',
                    },
                },
            },
            // CSS Files
            {
                test: /\.css$/,
                use: [
                    'style-loader',
                    'css-loader',
                ],
            },
            // Images
            {
                test: /\.(png|jpg|gif)$/i,
                type: 'asset',
                generator: { filename: 'static/img/[name].[hash].[ext]' },
            },
            // Fonts
            {
                test: /\.(eot|otf|ttf|woff|woff2)$/,
                type: 'asset',
                generator: { filename: 'static/fonts/[name].[hash].[ext]' },
            },
        ],
    },
    resolve: { extensions: ['.js', '.jsx'] },
    plugins: [
        new ModuleFederationPlugin({
            shared: {
                'react': { singleton: true, eager: true, requiredVersion: '^17.0.0' },
                'react-dom': { singleton: true, eager: true, requiredVersion: '^17.0.0' },
            },
        }),
        new MiniCssExtractPlugin({
            filename: 'assets/css/[name].[contenthash].css',
            chunkFilename: 'assets/css/[name].[contenthash].chunk.css',
        }),
        new HtmlWebpackPlugin({
            favicon: 'apps/mcdu/src/assets/images/favicon.ico',
            template: path.resolve(__dirname, 'src/index.html'),
            inject: false,
        }),
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(
                'development',
            ),
        }),
    ].filter(Boolean),
});
