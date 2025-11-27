const path = require('node:path');
const { DefinePlugin } = require('./common')

const usePath = (src) => path.resolve(__dirname, src);

module.exports = {
    target: 'electron-main',
    entry: './src/main/index.ts',
    output: {
        path: path.join(__dirname, '../.webpack/main'),
        filename: 'index.js'
    },
    plugins: [
        DefinePlugin(),
    ],
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        alias: {
            '@': usePath('../src'),
            '@utils': usePath('../src/renderer/utils'),
            '@jobs': usePath('../src/renderer/jobs'),
            '@components': usePath('../src/renderer/components'),
            '@fileKeep': usePath('../src/renderer/utils/fileKeep'),
            '@network': usePath('../src/renderer/utils/network'),
        },
        extensions: ['.js', '.ts', '.jsx', '.tsx', '.json'],
    },
};