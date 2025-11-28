import { BrowserWindow } from "electron";
import MenuBuilder from "./menu";
import path from "path";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;


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
    const mainWindow = new MainBrowserWindow({
        show: false,
        backgroundColor: '#FFF', // 背景色 
        webPreferences: {
            devTools: true, // 配合隐藏快捷组合
            nodeIntegration: true, // 集成node
            contextIsolation: false, // 上下文隔离
            webSecurity: false, // 关闭同源策略
            allowRunningInsecureContent: true, // 允许https混合内容
            webviewTag: true,
            preload: path.join(__dirname, '../../preload.js')
        },
    });
    return mainWindow;
}
export default createBrowserWindow;
export { MainBrowserWindow };