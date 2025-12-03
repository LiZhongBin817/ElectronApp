const { updateElectronApp, UpdateSourceType } = require('update-electron-app')
const { autoUpdater } = require('electron-updater')
const isDev = require('electron-is-dev');
const log = require('electron-log');
const { dialog } = require('electron');

// // ① 开启日志
// autoUpdater.logger = log;
// autoUpdater.logger.transports.file.level = 'info';
// autoUpdater.logger.transports.console.level = 'silly'; // 控制台也输出

// // ② 强制检查一次（开发时）
// autoUpdater.forceDevUpdateConfig = true;   // 打破「未打包」限制

// // ③ 捕获 404 不让它抛错（关键）
// autoUpdater.on('error', (err) => {
//     // 只打印，不重新抛出 → 流程继续
//     console.log('[Updater] 内部错误（可继续）:', err.message);
// });

// autoUpdater.checkForUpdatesAndNotify();

// // ③ 把日志目录打印到控制台
// console.log('[Updater] Log dir:', log.transports.file.getFile().path);
/* ================= 用户侧自动更新 ================= */
function setupAutoUpdater(opts = {}) {

    // 开发环境不检查
    if (isDev) return;
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
        /** 选填-更新地址 */
        url = 'https://github.com/LiZhongBin817/ElectronApp/releases/v1.0.0/',
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
        autoUpdater.checkForUpdates();
    } else if (type === 'custom') {
        // // 企业方案（electron-updater）
        autoUpdater.setFeedURL({
            provider,
            owner,
            repo,
            releaseType: 'release'
        });
        // // autoUpdater.setFeedURL({
        // //     provider: 'generic',
        // //     url: 'http://localhost:3000',   // 指向本地 nupkg/RELEASES 目录
        // // });
        autoUpdater.checkForUpdatesAndNotify();


    }
    // 监听更新事件
    autoUpdater.on('update-available', () => {
        dialog.showMessageBox({
            type: 'info',
            title: '更新提示',
            message: '检测到新版本，正在下载...'
        });
    });

    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox({
            type: 'info',
            title: '安装更新',
            message: '下载完成，点击确定安装并重启应用。',
            buttons: ['确定']
        }).then(() => {
            autoUpdater.quitAndInstall();
        });
    });
}

module.exports = { setupAutoUpdater }