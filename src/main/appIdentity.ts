/**
 * 固定桌面端应用身份，避免开发版 ElectronApp 和安装版 TimeManageSystem 使用不同配置目录。
 */
import { app } from 'electron';
import path from 'path';

export const APP_NAME = 'TimeManageSystem';

export function setupAppIdentity() {
  app.setName(APP_NAME);
  app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));
}
