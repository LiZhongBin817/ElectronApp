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
const packagedDirName = `${appName}-win32-x64`;
const commandExtension = process.platform === 'win32' ? '.cmd' : '';

const localBin = (name) => path.join(root, 'node_modules', '.bin', `${name}${commandExtension}`);

const quoted = (value) => `"${value}"`;

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

const writeUpdateConfig = () => {
  const resourcesDir = path.join(outDir, packagedDirName, 'resources');
  const updateConfigPath = path.join(resourcesDir, 'app-update.yml');
  const updateConfig = [
    'provider: github',
    'owner: LiZhongBin817',
    'repo: ElectronApp',
    'releaseType: release',
    'updaterCacheDirName: timemanagesystem-updater',
    '',
  ].join('\n');

  fs.writeFileSync(updateConfigPath, updateConfig);
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
run(`${quoted(localBin('electron-forge'))} package --platform=win32 --arch=x64`);
writeUpdateConfig();

console.log('[Build] 使用 electron-builder 生成 NSIS 安装包和更新元数据...');
run(`${quoted(localBin('electron-builder'))} --win --x64 --publish never --prepackaged out/${packagedDirName}`);

console.log('[Build] 构建完成。');
