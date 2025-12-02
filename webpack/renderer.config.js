const path = require('node:path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin'); // runs TypeScript type checker on a separate process.
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { DefinePlugin } = require('./common')
const HtmlWebpackPlugin = require('html-webpack-plugin');
const PrefreshWebpack = require('@prefresh/webpack');

const usePath = (src) => path.resolve(__dirname, src);
module.exports = {
    target: 'electron-renderer', // 表明此模块为electron的渲染模块, 使其可以识别electron
    module: {
        rules: [{
            test: /\.tsx?$/,
            use: {
                loader: 'babel-loader',
                options: {
                    presets: [
                        ['@babel/preset-typescript', { allExtensions: true, isTSX: true }],
                        'babel-preset-solid'          // ← 负责把 JSX 转成 Solid 运行时调用
                    ]
                }
            },
            exclude: /node_modules/,
        }]
    },
    mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
    devtool: 'source-map',
    plugins: [
        new PrefreshWebpack(),          // ← Solid HMR
    ],
    resolve: {
        alias: {
            '@': usePath('../src'),
            '@jobs': usePath('../src/renderer/jobs'),
            '@App': usePath('../src/renderer/App'),
            '@components': usePath('../src/renderer/components'),
            '@Button': usePath('../src/renderer/components/Button'),
            '@Space': usePath('../src/renderer/components/Space'),
            '@DatePickerPlus': usePath('../src/renderer/components/DatePickerPlus'),
            '@OnlyLocalShow': usePath('../src/renderer/OnlyLocalShow'),
            '@NullComponent': usePath('../src/renderer/NullComponent'),
            '@DataCenter': usePath('../src/renderer/DataCenter'),
            '@BoosterNext': usePath('../src/renderer/jobs/BoosterNext'),
            '@Booster': usePath('../src/renderer/jobs/Booster'),
            '@utils': usePath('../src/renderer/utils'),
            '@fileKeep': usePath('../src/renderer/utils/fileKeep'),
            '@helper': usePath('../src/renderer/utils/helper'),
            '@excel': usePath('../src/renderer/utils/excel'),
            '@network': usePath('../src/renderer/utils/network'),
            '@puppeteer': usePath('../src/renderer/utils/puppeteer'),
            // '@PowerFetch': usePath('../src/PowerFetch'),
            '@PowerFetch': usePath('../src/renderer/utils/network/PowerFetch'),
        },
        extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', 'json'],
    },
}