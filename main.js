const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const { updateElectronApp } = require('update-electron-app')

// 配置更新器
updateElectronApp({
    updateSource: {
        type: "ElectronPublicUpdateService",
        repo: 'LiZhongBin817/ElectronApp'
    }
});
const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    })

    win.loadFile('index.html')
}

app.whenReady().then(() => {
    createWindow()

    // 如果没有窗口打开则打开一个窗口 (macOS)
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// 关闭所有窗口时退出应用 (Windows & Linux) 
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})