'use strict';

const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (_env, argv) => {
    const isProduction = argv.mode === 'production';
    const isDevelopment = !isProduction;

    return {
        devtool: isDevelopment && 'cheap-module-source-map',
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
                            envName: isProduction ? 'production' : 'development',
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
            new MiniCssExtractPlugin({
                filename: 'assets/css/[name].[contenthash].css',
                chunkFilename: 'assets/css/[name].[contenthash].chunk.css',
            }),
            new HtmlWebpackPlugin({
                favicon: 'apps/mcdu/src/assets/images/favicon.ico',
                template: path.resolve(__dirname, 'src/index.html'),
                inject: 'head',
            }),
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify(
                    isProduction ? 'production' : 'development',
                ),
            }),
        ].filter(Boolean),
    };
};
