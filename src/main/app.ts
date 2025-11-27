import { app, BrowserWindow, ipcMain } from "electron"
import createBrowserWindow from "./BrowserWindow"
import path from "path";
import { devHotReload, setupAutoUpdater } from "../../webpack/autoUpdater";
import MenuBuilder from "./menu";

export class App {
    win?: BrowserWindow | null
    constructor() {
        // 初始化
        this.listen()
    }

    /** 监听应用事件 */
    listen() {
        app.on('ready', this.launch.bind(this));

        app.whenReady().then(async () => {
            // 开发阶段：保存即重启/刷新
            devHotReload({
                watchFolder: path.join(__dirname, '../../src'), // 静态资源
                mainFolder: __dirname                         // 主进程代码
            });

            // 启动APP自动更新 
            // 首次检查建议延迟 3-5 秒，避免刚启动就弹通知
            setTimeout(() => setupAutoUpdater({ type: 'github', owner: 'LiZhongBin817', repo: 'ElectronApp', provider: 'lizb' }), 4000);
        })


        // 如果没有窗口打开则打开一个窗口 (macOS)
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createBrowserWindow()
        })


        // 关闭所有窗口时退出应用 (Windows & Linux) 
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') app.quit()
        })
    }

    /** 启动窗口 */
    async launch() {
        process.env.ELECTRON_DISABLE_SECURITY_WARRING = 'true'; // 关闭警告

        if (this.win) {
            this.win.destroy();
        }
        this.win = createBrowserWindow()
        const menu = new MenuBuilder(this.win)
        menu.buildMenu()

    }
}