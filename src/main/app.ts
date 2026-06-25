import { app, BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import createBrowserWindow from "./BrowserWindow";
import { setupAutoUpdater } from "../../webpack/autoUpdater";
import { setupAppIdentity } from "./appIdentity";
import { getApiRuntimeConfig, saveRemoteApiBaseUrl, useLocalApiBaseUrl } from "./apiRuntimeConfig";
import { getLocalApiBaseUrl, startLocalApiServer, stopLocalApiServer } from "./localApiServer";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;

setupAppIdentity();

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
    ipcMain.handle("api:get-runtime-config", () => getApiRuntimeConfig());
    ipcMain.handle("api:set-remote-base-url", async (_event, value: string) => {
      const next = await saveRemoteApiBaseUrl(value);
      stopLocalApiServer();
      return next;
    });
    ipcMain.handle("api:use-local-base-url", async () => {
      const next = useLocalApiBaseUrl();
      const apiBaseUrl = await startLocalApiServer(MAIN_WINDOW_WEBPACK_ENTRY);
      return { ...next, activeBaseUrl: apiBaseUrl };
    });
    ipcMain.handle("api:get-base-url", () => getApiRuntimeConfig().activeBaseUrl);
    ipcMain.on("api:get-base-url-sync", (event) => {
      event.returnValue = getApiRuntimeConfig().activeBaseUrl;
    });
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

    app.on("before-quit", () => {
      stopLocalApiServer();
    });
  }

  /** 启动主窗口 */
  async launch() {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
    try {
      const runtimeConfig = getApiRuntimeConfig();
      const apiBaseUrl = runtimeConfig.mode === 'remote'
        ? runtimeConfig.activeBaseUrl
        : await startLocalApiServer(MAIN_WINDOW_WEBPACK_ENTRY);
      process.env.TMS_API_BASE_URL = apiBaseUrl || getLocalApiBaseUrl();
      log.info(`[TMS] API server ready: ${apiBaseUrl}`);
    } catch (error) {
      log.error("[TMS] API server startup failed", error);
      throw error;
    }

    if (this.win) {
      this.win.destroy();
    }

    this.win = createBrowserWindow();
    this.win.show();
  }
}
