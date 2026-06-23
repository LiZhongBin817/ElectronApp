const { dialog } = require('electron');
const isDev = require('electron-is-dev');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

let updaterStarted = false;

function setupAutoUpdater(options = {}) {
  autoUpdater.logger = log;
  log.transports.file.level = 'info';

  log.info('[Updater] 初始化自动更新模块。');

  if (isDev) {
    log.info('[Updater] 当前为开发模式，跳过自动更新。');
    return;
  }

  if (updaterStarted) {
    log.info('[Updater] 自动更新已启动，跳过重复初始化。');
    return;
  }

  updaterStarted = true;

  const {
    provider = 'github',
    owner = 'LiZhongBin817',
    repo = 'ElectronApp',
  } = options;

  autoUpdater.autoDownload = false;

  autoUpdater.setFeedURL({
    provider,
    owner,
    repo,
    releaseType: 'release',
  });

  log.info('[Updater] 更新源配置完成：', { provider, owner, repo });

  autoUpdater.on('error', (error) => {
    log.error('[Updater] 检查更新失败：', error);
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('[Updater] 正在检查更新...');
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('[Updater] 当前已是最新版本：', info.version);
  });

  autoUpdater.on('update-available', async (info) => {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，是否现在下载？`,
      buttons: ['下载', '取消'],
      cancelId: 1,
    });

    if (result.response === 0) {
      autoUpdater.downloadUpdate().catch((error) => {
        log.error('[Updater] 下载更新失败：', error);
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`[Updater] 下载进度：${progress.percent.toFixed(2)}%`);
  });

  autoUpdater.on('update-downloaded', async () => {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: '更新已下载',
      message: '新版本已下载完成，是否立即安装并重启？',
      buttons: ['立即安装', '稍后'],
      cancelId: 1,
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.checkForUpdates().catch((error) => {
    log.error('[Updater] 检查更新异常：', error);
  });
}

module.exports = { setupAutoUpdater };
