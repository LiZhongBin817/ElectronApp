const path = require('node:path');
const { DefinePlugin } = require('./common')
const usePath = (src) => path.resolve(__dirname, src);
const { spawn } = require('node:child_process');

let electronProc = null;
function restartElectron() {
    if (electronProc) electronProc.kill();
    // 用 Forge 相同的 electron 可执行文件
    electronProc = spawn(require('electron'), ['.'], { stdio: 'inherit' });
}

module.exports = {
    target: 'electron-main',
    entry: path.resolve(__dirname, '../src/main/index.ts'),
    // 添加以下配置以支持 HMR
    mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
    devtool: 'source-map',
    plugins: [
        DefinePlugin(),
        {
            apply(compiler) {
                compiler.hooks.afterEmit.tap('RestartElectron', () => {
                    console.log('[webpack] Compiled → restart Electron');
                    restartElectron();
                });
            }
        }
    ],
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