import { BrowserWindow, MenuItemConstructorOptions, Menu } from "electron";
import localShortcut from 'electron-localshortcut';
export default class MenuBuilder {
    mainWindow: BrowserWindow;
    template: MenuItemConstructorOptions[] = [];
    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    get isDev(): boolean {
        return Env_Local || Env_Test || process.env.NODE_ENV === 'development';
    }
    get isMac(): boolean {
        return process.platform === 'darwin';
    }


    /** 菜单构建 */
    buildMenu(): Menu {
        this.bindShortCut();
        if (this.isDev) {
            this.setDevContextMenu();
        }

        this.template = [];
        const menu = Menu.buildFromTemplate(this.template);
        Menu.setApplicationMenu(null);

        return menu;
    }

    // 绑定快捷键
    bindShortCut() {
        localShortcut.register(this.mainWindow, 'Alt+F12', () => {
            this.mainWindow.webContents.toggleDevTools();
        });

        // 隐藏私有快捷键! 调试devTools / Debugtron
        // 禁掉默认打开快捷键
        this.mainWindow.webContents.on('before-input-event', (event, input) => {
            const key = input.key.toLowerCase();
            // 拦截按键 meta
            if (['shift'].includes(key)) {
                event.preventDefault();
            }
        });
    }

    // 开发环境, 右键菜单
    setDevContextMenu(): void {
        this.mainWindow.webContents.on('context-menu', (_, props) => {
            const { x, y } = props;
            Menu.buildFromTemplate([
                {
                    label: 'Inspect',
                    click: () => {
                        this.mainWindow.webContents.inspectElement(x, y);
                    },
                },
                { label: 'DevTools', role: 'toggleDevTools' },
            ]).popup({ window: this.mainWindow });
        });
    }
}
