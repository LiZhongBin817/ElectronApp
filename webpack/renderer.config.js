const path = require('node:path');
const { VueLoaderPlugin } = require('vue-loader');

const usePath = (src) => path.resolve(__dirname, src);

module.exports = (_env, argv = {}) => {
  const isProduction = argv.mode === 'production';

  return {
    target: 'electron-renderer',
    entry: path.resolve(__dirname, '../src/renderer/index.tsx'),
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    plugins: [
      new VueLoaderPlugin(),
    ],
    module: {
      rules: [
        {
          test: /\.vue$/,
          loader: 'vue-loader',
        },
        {
          test: /\.tsx?$/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-typescript', { allExtensions: true, isTSX: true }],
              ],
            },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/,
          type: 'asset/resource',
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
        '@PowerFetch': usePath('../src/renderer/utils/network/PowerFetch'),
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.vue', '.json'],
    },
  };
};
