#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'out');
const distDir = path.join(root, 'dist');
const packagePath = path.join(root, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const appName = packageJson.productName || packageJson.name;

const run = (command) => {
  execSync(command, {
    cwd: root,
    stdio: 'inherit',
  });
};

const removeDir = (targetDir) => {
  if (!fs.existsSync(targetDir)) {
    return;
  }

  fs.rmSync(targetDir, {
    recursive: true,
    force: true,
  });
};

const closeRunningApp = () => {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /f /im ${appName}.exe 2>nul`, { stdio: 'ignore' });
      return;
    }

    execSync(`pkill -f "${appName}" 2>/dev/null || true`, { stdio: 'ignore' });
  } catch {
    // 未运行时无需处理。
  }
};

console.log('[Build] 关闭正在运行的应用...');
closeRunningApp();

console.log('[Build] 清理旧产物...');
removeDir(outDir);
removeDir(distDir);

console.log('[Build] 使用 Electron Forge 生成预打包目录...');
run('electron-forge package --platform=win32 --arch=x64');

console.log('[Build] 使用 electron-builder 生成 NSIS 安装包和更新元数据...');
run('electron-builder --win --x64 --publish never --prepackaged out/ElectronApp-win32-x64');

console.log('[Build] 构建完成。');
