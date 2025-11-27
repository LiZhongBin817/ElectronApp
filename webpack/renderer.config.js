const path = require('node:path');

const usePath = (src) => path.resolve(__dirname, src);

module.exports = {
    target: 'electron-renderer', // 表明此模块为electron的渲染模块, 使其可以识别electron
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