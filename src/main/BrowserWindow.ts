import { BrowserWindow } from "electron";

class MainBrowserWindow extends BrowserWindow {
    constructor(options: Electron.BrowserWindowConstructorOptions | undefined) {
        super(options);
    }
}

const createBrowserWindow = () => {
    const mainWindow = new MainBrowserWindow({
        backgroundColor: '#FFF', // 背景色 
        webPreferences: {
            devTools: true, // 配合隐藏快捷组合
            nodeIntegration: true, // 集成node
            contextIsolation: false, // 上下文隔离
            webSecurity: false, // 关闭同源策略
            allowRunningInsecureContent: true, // 允许https混合内容
            webviewTag: true,
        },
    });

    return mainWindow;
}
export default createBrowserWindow;
export { MainBrowserWindow };