const { updateElectronApp } = require('update-electron-app')
const { autoUpdater } = require('electron-updater')
const isDev = require('electron-is-dev');
const log = require('electron-log');

// ① 开启日志
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level   = 'info';
autoUpdater.logger.transports.console.level = 'silly'; // 控制台也输出

// ② 强制检查一次（开发时）
autoUpdater.forceDevUpdateConfig = true;   // 打破「未打包」限制
autoUpdater.checkForUpdatesAndNotify();

// ③ 把日志目录打印到控制台
console.log('[Updater] Log dir:', log.transports.file.getFile().path);
/* ================= 用户侧自动更新 ================= */
function setupAutoUpdater(opts = {}) {

    // 开发环境不检查
    // if (isDev) return;
    const {
        /** 必填-自动更新类型 */
        type = 'github',
        /** 选填-仓库账号 */
        owner,
        /** 选填-仓库名称 */
        repo,
        /**  electron-updater 用 */
        /** 选填-更新提供者 */
        provider = 'generic',
    } = opts;

    if (type === 'github') {
        updateElectronApp({
            updateSource: {
                owner,
                type,
                repo
            },
            // 可选配置
            provider, // 指定更新提供者
            logger: log
        });
    } else if (type === 'custom') {
        // 企业方案（electron-updater）
        // autoUpdater.setFeedURL({
        //     provider,
        //     owner,
        //     repo,
        //     private: false,              // 公开仓库
        //     token: process.env.GITHUB_TOKEN  // 仅私有仓库需要
        // });
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: 'http://localhost:3000',   // 指向本地 nupkg/RELEASES 目录
        });
        autoUpdater.checkForUpdatesAndNotify();
        // 监听更新事件（可选）
        autoUpdater.on('checking-for-update', () => {
            console.log('正在检查更新...');
        });

        autoUpdater.on('update-available', (info) => {
            console.log('发现新版本:', info.version);
        });

        autoUpdater.on('update-not-available', () => {
            console.log('当前已是最新版本');
        });

        autoUpdater.on('error', (error) => {
            console.error('更新检查出错:', error);
        });
    }
}

module.exports = { setupAutoUpdater }