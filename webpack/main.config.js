const path = require('node:path');
const { DefinePlugin } = require('./common');

const usePath = (src) => path.resolve(__dirname, src);

module.exports = (_env, argv = {}) => {
  const isProduction = argv.mode === 'production';

  return {
    target: 'electron-main',
    entry: path.resolve(__dirname, '../src/main/index.ts'),
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    plugins: [
      DefinePlugin(),
    ],
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-typescript', { allExtensions: true, isTSX: true }],
                'babel-preset-solid',
              ],
            },
          },
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
};
