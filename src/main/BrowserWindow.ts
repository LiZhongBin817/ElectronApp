import { BrowserWindow, screen } from "electron";
import MenuBuilder from "./menu";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;


class MainBrowserWindow extends BrowserWindow {
    constructor(options: Electron.BrowserWindowConstructorOptions | undefined) {
        super(options);
        this.run()
    }

    /** 主流程 */
    run() {
        this.register()
    }


    /** 注册菜单 */
    register() {
        //关键点
        this.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
        const menu = new MenuBuilder(this)
        menu.buildMenu()
    }
}

const createBrowserWindow = () => {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const windowWidth = Math.min(1280, Math.max(1080, Math.floor(screenWidth * 0.9)));
    const windowHeight = Math.min(860, Math.max(720, Math.floor(screenHeight * 0.9)));

    const mainWindow = new MainBrowserWindow({
        width: windowWidth,
        height: windowHeight,
        minWidth: 1080,
        minHeight: 720,
        title: '本地服务管理器',
        show: false,
        backgroundColor: '#FFF', // 背景色 
        webPreferences: {
            devTools: true, // 配合隐藏快捷组合
            nodeIntegration: true, // 集成node
            contextIsolation: false, // 上下文隔离
            webSecurity: false, // 关闭同源策略
            allowRunningInsecureContent: true, // 允许https混合内容
            webviewTag: true,
            preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
        },
    }); 
    return mainWindow;

}
export default createBrowserWindow;
export { MainBrowserWindow };
