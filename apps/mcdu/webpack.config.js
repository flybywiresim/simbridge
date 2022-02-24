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
            path: path.join(__dirname, 'dist/apps/mcdu'),
            filename: 'index.js',
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
                        isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
                        'css-loader',
                    ],
                },
                // Images
                {
                    test: /\.(png|jpg|gif)$/i,
                    use: {
                        loader: 'url-loader',
                        options: {
                            limit: 8192,
                            name: 'static/media/[name].[hash:8].[ext]',
                        },
                    },
                },
                // Everything else
                {
                    test: /\.(eot|otf|ttf|woff|woff2)$/,
                    loader: require.resolve('file-loader'),
                    options: { name: 'static/media/[name].[hash:8].[ext]' },
                },
            ],
        },
        resolve: { extensions: ['.js', '.jsx'] },
        plugins: [
            isProduction
                && new MiniCssExtractPlugin({
                    filename: 'assets/css/[name].[contenthash:8].css',
                    chunkFilename: 'assets/css/[name].[contenthash:8].chunk.css',
                }),
            // TODO fix head tags, fix favicon, fix rejected fonts
            new HtmlWebpackPlugin({
                favicon: './apps/mcdu/src/assets/images/favicon.ico',
                template: path.resolve(__dirname, 'src/index.html'),
                inject: false,
            }),
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify(
                    isProduction ? 'production' : 'development',
                ),
            }),
        ].filter(Boolean),
    };
};
