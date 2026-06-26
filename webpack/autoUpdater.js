const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

const UPDATER_STATUS_CHANNEL = 'updater:status';
const UPDATER_GET_STATUS_CHANNEL = 'updater:get-status';
let updaterStarted = false;
let updaterIpcRegistered = false;
let downloadingVersion = '';
let latestUpdaterStatus = null;

const normalizeProgressPercent = (percent) => {
  if (!Number.isFinite(percent)) {
    return 0;
  }

  return Math.min(100, Math.max(0, percent));
};

const getErrorMessage = (error) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return '未知错误';
};

const sendUpdaterStatus = (status) => {
  const updaterStatus = {
    timestamp: Date.now(),
    ...status,
  };
  latestUpdaterStatus = updaterStatus;

  BrowserWindow.getAllWindows().forEach((browserWindow) => {
    if (browserWindow.isDestroyed()) {
      return;
    }

    browserWindow.webContents.send(UPDATER_STATUS_CHANNEL, updaterStatus);
  });
};

const registerUpdaterIpc = () => {
  if (updaterIpcRegistered) {
    return;
  }

  updaterIpcRegistered = true;
  ipcMain.handle(UPDATER_GET_STATUS_CHANNEL, () => latestUpdaterStatus);
};

function setupAutoUpdater(options = {}) {
  registerUpdaterIpc();
  autoUpdater.logger = log;
  log.transports.file.level = 'info';
  log.transports.console.level = false;

  log.info('[Updater] 初始化自动更新模块。');

  if (!app.isPackaged) {
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
    sendUpdaterStatus({
      status: 'error',
      message: `更新检查失败：${getErrorMessage(error)}`,
    });
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('[Updater] 正在检查更新...');
    sendUpdaterStatus({
      status: 'checking',
      message: '正在检查更新...',
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('[Updater] 当前已是最新版本：', info.version);
    sendUpdaterStatus({
      status: 'not-available',
      version: info.version,
      message: '当前已是最新版本',
    });
  });

  autoUpdater.on('update-available', async (info) => {
    sendUpdaterStatus({
      status: 'available',
      version: info.version,
      message: `发现新版本 ${info.version}`,
    });

    const result = await dialog.showMessageBox({
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，是否现在下载？`,
      buttons: ['下载', '取消'],
      cancelId: 1,
    });

    if (result.response === 0) {
      downloadingVersion = info.version;
      sendUpdaterStatus({
        status: 'downloading',
        version: info.version,
        percent: 0,
        bytesPerSecond: 0,
        transferred: 0,
        total: 0,
        message: `正在下载更新：${info.version}`,
      });

      autoUpdater.downloadUpdate().catch((error) => {
        log.error('[Updater] 下载更新失败：', error);
        downloadingVersion = '';
        sendUpdaterStatus({
          status: 'error',
          version: info.version,
          percent: 0,
          message: `下载更新失败：${getErrorMessage(error)}`,
        });
      });

      return;
    }

    sendUpdaterStatus({
      status: 'cancelled',
      version: info.version,
      message: '已取消本次更新下载',
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = normalizeProgressPercent(progress.percent);
    log.info(`[Updater] 下载进度：${percent.toFixed(2)}%`);
    sendUpdaterStatus({
      status: 'downloading',
      version: downloadingVersion,
      percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
      message: `正在下载更新：${percent.toFixed(2)}%`,
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    downloadingVersion = '';
    sendUpdaterStatus({
      status: 'downloaded',
      version: info.version,
      percent: 100,
      message: '更新已下载，等待安装',
    });

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
    sendUpdaterStatus({
      status: 'error',
      message: `检查更新异常：${getErrorMessage(error)}`,
    });
  });
}

module.exports = { registerUpdaterIpc, setupAutoUpdater };
