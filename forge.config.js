const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'ElectronApp',
        authors: 'lizb',
        setupExe: 'ElectronAppSetup.exe',
        // setupIcon: 'path/to/icon.ico', // 如果有图标
        // iconUrl: 'https://your-icon-url.com/icon.ico', // 远程图标URL
        // loadingGif: 'path/to/loading.gif', // 安装过程动画（可选）
        noMsi: true,
        // certificateFile: '', // 如需代码签名
        // certificatePassword: '',
        // 使用相对路径输出
        outputDirectory: 'out/windows',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack/main.config.js',
        devContentSecurityPolicy:
          "connect-src 'self' http://127.0.0.1:* http://localhost:* wss://127.0.0.1:7693 http://api.jfbym.com 'unsafe-eval'",
        renderer: {
          config: './webpack/renderer.config.js',
          entryPoints: [
            {
              html: './src/renderer/index.html',
              js: './src/renderer/index.tsx',
              name: 'main_window',
            },
            // {
            //   html: './src/Popup/Entry/index.html',
            //   js: './src/Popup/Entry/index.tsx',
            //   name: 'popup_window',
            // },
          ],
        },
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  // 发布配置
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'LiZhongBin817',
          name: 'ElectronApp'
        },
        // 这个发布版本不是预发布版本
        prerelease: false,
        // true：发布版本将作为草稿发布，不会立即公开显示
        // false：发布版本将作为正式版本发布，会立即公开显示
        draft: true
      }
    }
  ]
};
