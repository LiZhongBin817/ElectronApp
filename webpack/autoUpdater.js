
const { app, BrowserWindow } = require('electron')
const { updateElectronApp } = require('update-electron-app')
const { autoUpdater } = require('electron-updater')
const isDev = require('electron-is-dev');
const path = require('node:path')
const chokidar = require('chokidar');
const fs = require('fs');

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
        /** 选填-自建服务器地址 */
        url = ''
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
            channel: 'stable',  // 指定更新通道
            logger: console,   // 自定义日志输出
        });
    } else {
        // 企业方案（electron-updater）
        autoUpdater.setFeedURL({ provider, url });
        autoUpdater.checkForUpdatesAndNotify();
    }

    updateElectronApp({
        updateSource: {
            type: "ElectronPublicUpdateService",
            repo: 'LiZhongBin817/ElectronApp'
        },
        // 可选配置
        provider: 'lizb', // 指定更新提供者
    });

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

/* ================= 开发热重载 ================= */
function devHotReload(opts = {}) {
    if (!isDev) return;                   // 生产直接退出

    const {
        watchFolder = path.join(__dirname, 'src'),   // 渲染代码
        mainFolder = __dirname,                      // 主进程根
    } = opts;

    const lockFile = path.join(mainFolder, '.restart-lock'); // 简单锁

    // 1. 主进程自动重启 文件变动 → 重启 App（防死循环）
    const mainWatcher = chokidar.watch([
        path.join(mainFolder, 'main.js'),
        path.join(mainFolder, 'preload.js')
    ], {
        usePolling: true,
        ignored: [
            '**/node_modules/**',
            '**/out/**',
            '**/.git/**',
            '**/*.log',
            '**/.restart-lock'
        ],
        awaitWriteFinish: { stabilityThreshold: 300 } // 防抖
    });

    mainWatcher.on('change', file => {
        if (fs.existsSync(lockFile)) return; // 正在重启，忽略
        fs.writeFileSync(lockFile, '');      // 加锁
        console.log('[HMR] main changed → restart');
        app.relaunch();
        app.exit(0);
    });

    // 2. 渲染进程整页刷新
    chokidar.watch(watchFolder, { usePolling: true, ignored: ['**/node_modules/**', '**/out/**', '**/.git/**'] })
        .on('all', (event, file) => {
            console.log('[HMR]', event, '→', file);
            if (event === 'change') {
                BrowserWindow.getAllWindows().forEach(w => {
                    if (!w.isDestroyed()) w.reload();
                });
            }
        });
}

module.exports = { setupAutoUpdater, devHotReload }