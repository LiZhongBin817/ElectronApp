#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'out');
const packagePath = path.resolve(__dirname, '../package.json');
const appName = (JSON.parse(fs.readFileSync(packagePath, 'utf8')).productName ||
                JSON.parse(fs.readFileSync(packagePath, 'utf8')).name);

console.log('[Clean] 开始清占用 & 缓存...');

// 1. 关进程（找不到就继续）
try {
  if (process.platform === 'win32') {
    execSync(`taskkill /f /im ${appName}.exe 2>nul`, { stdio: 'inherit' });
  } else {
    execSync(`pkill -f ${appName} 2>/dev/null || true`);
  }
  console.log('[Clean] 已关闭进程');
} catch (e) {
  console.log('[Clean] 进程未运行，继续');
}

// 2. 重试删除（防 EPERM）
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function rmRetry(dir, retries = 5) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function tryRm() {
      attempt++;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log('[Clean] 已删除 out');
        resolve();
      } catch (e) {
        if (e.code === 'EPERM' && attempt < retries) {
          console.log(`[Clean] 重试删除 ${attempt}`);
          delay(1000).then(tryRm);
        } else {
          reject(e);
        }
      }
    }
    tryRm();
  });
}

// 3. 执行删除（同步等待）
rmRetry(outDir).then(() => {
  // 4. 清缓存（可选）
  const cacheDir = path.join(root, 'node_modules', '.cache');
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log('[Clean] 已删除 .cache');
  }
  console.log('[Clean] 完成 ✅');

  // 5. 打包（无 await）
  console.log('[Build] 开始构建...');
  execSync('electron-forge make', { stdio: 'inherit' });
  execSync('electron-builder --win --x64 --publish never --prepackaged out/ElectronApp-win32-x64', { stdio: 'inherit' });
  console.log('[Build] 构建完成 ✅');
}).catch(err => {
  console.error('[Clean] 删除失败', err);
  process.exit(1);
});