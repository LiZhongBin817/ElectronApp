import { app, BrowserWindow, ipcMain } from "electron";
import createBrowserWindow from "./BrowserWindow";
import { setupAutoUpdater } from "../../webpack/autoUpdater";

export class App {
  win?: BrowserWindow | null;

  constructor() {
    if (!this.pre()) {
      return;
    }

    this.registerIpc();
    this.listen();
  }

  /** 注册主进程接口 */
  registerIpc() {
    ipcMain.handle("app:get-version", () => app.getVersion());
  }

  pre() {
    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
      app.quit();
      return false;
    }

    app.on("second-instance", () => {
      if (!this.win) {
        return;
      }

      if (this.win.isMinimized()) {
        this.win.restore();
      }

      this.win.focus();
    });

    return true;
  }

  /** 监听应用事件 */
  listen() {
    app.on("ready", this.launch.bind(this));

    app.whenReady().then(async () => {
      // 打包环境启动后延迟检查更新，避免刚打开窗口就弹提示。
      setTimeout(() => setupAutoUpdater(), 4000);
      this.win?.show();
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.win = createBrowserWindow();
      }
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });
  }

  /** 启动主窗口 */
  async launch() {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

    if (this.win) {
      this.win.destroy();
    }

    this.win = createBrowserWindow();
  }
}
