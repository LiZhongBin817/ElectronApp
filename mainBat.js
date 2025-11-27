const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const { setupAutoUpdater, devHotReload } = require('./webpack/autoUpdater')

/** 创建窗口 */
const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    })

    const indexPath = path.join(process.cwd(), 'public/index.html');
    win.loadFile(indexPath);
}

app.whenReady().then(async () => {
    await createWindow()
    // 开发阶段：保存即重启/刷新
    devHotReload({
        watchFolder: path.join(__dirname, 'src'), // 静态资源
        mainFolder: __dirname                         // 主进程代码
    });

    // 启动APP自动更新 
    // 首次检查建议延迟 3-5 秒，避免刚启动就弹通知
    setTimeout(() => setupAutoUpdater({ type: 'github', owner: 'LiZhongBin817', repo: 'ElectronApp', provider: 'lizb' }), 4000);

    // 如果没有窗口打开则打开一个窗口 (macOS)
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    ipcMain.handle('open-devtools', () => {
        const [win] = BrowserWindow.getAllWindows();
        if (win) win.webContents.openDevTools({ mode: 'right' });
    });
})

