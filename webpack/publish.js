#!/usr/bin/env node
/**
 * 一键完成：
 * 1. 版本号 patch+1
 * 2. 打 tag 并 push 到 GitHub
 * 3. 用 electron-forge 打包并上传到 GitHub Releases
 * 使用前先 export GITHUB_TOKEN=ghp_xxxxxxxx
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 获取 package.json 文件路径
const packagePath = path.resolve(__dirname, '../package.json');

// 读取原始版本号
const originalPkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const originalVer = originalPkg.version;

// 跟踪tag是否已创建
let tagCreated = false;
// 检查标签是否已存在
const tagExists = (version) => {
  try {
    execSync(`git rev-parse "v${version}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// 回退tag和版本号的函数
const rollback = (version) => {
  console.log('🔄 正在回退...');

  // 回退tag
  try {
    if (tagCreated) {
      execSync(`git tag -d "v${version}"`, { stdio: 'inherit' });
      execSync(`git push ElectronApp :refs/tags/v${version}`, { stdio: 'inherit' });
      console.log('✅ Tag回退完成');
    } else {
      console.log('ℹ️ 未创建tag，无需回退');
    }
  } catch (rollbackError) {
    console.error('⚠️ Tag回退失败:', rollbackError.message);
  }

  // 回退 package.json 和 package-lock.json 版本号
  try {
    const currentPkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    currentPkg.version = originalVer;
    fs.writeFileSync(packagePath, JSON.stringify(currentPkg, null, 2) + '\n');

    // 更新 package-lock.json
    const lockFilePath = path.resolve(__dirname, '../package-lock.json');
    const lockFile = JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
    lockFile.name = 'Electron_App'; // 确保名称正确
    lockFile.version = originalVer; // 更新版本号

    // 更新所有依赖项的版本号
    Object.keys(lockFile.dependencies || {}).forEach(depName => {
      if (lockFile.dependencies[depName].version) {
        lockFile.dependencies[depName].version = originalVer;
      }
    });

    fs.writeFileSync(lockFilePath, JSON.stringify(lockFile, null, 2) + '\n');

    execSync(`git add package.json package-lock.json`, { stdio: 'inherit' });
    execSync(`git commit -m "Revert to version ${originalVer}"`, { stdio: 'inherit' });
    console.log('✅ 版本号回退完成');
  } catch (versionRollbackError) {
    console.error('⚠️ 版本号回退失败:', versionRollbackError.message);
  }
}

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('❌ 请先设置环境变量 GITHUB_TOKEN');
  process.exit(1);
}

const repoUrl = execSync('git remote get-url ElectronApp', { encoding: 'utf8' }).trim();
if (!repoUrl.includes('github.com')) {
  console.error('❌ 远程仓库不是 GitHub');
  process.exit(1);
}

console.log(`🔼 版本号从 ${originalVer} +1 ...`);
execSync('npm version patch --no-git-tag-version', { stdio: 'inherit' });
const pkg = require('../package.json');
const newVer = pkg.version;

try {
  // 检查标签是否已存在
  if (tagExists(newVer)) {
    console.warn(`⚠️ 标签 v${newVer} 已存在，正在删除旧标签...`);
    execSync(`git tag -d "v${newVer}"`, { stdio: 'inherit' });
    try {
      execSync(`git push ElectronApp :refs/tags/v${newVer}`, { stdio: 'inherit' });
    } catch (e) {
      console.warn('⚠️ 远程标签删除失败（可能不存在）');
    }
  }

  console.log('🔼 创建并推送 tag ...');
  execSync(`git add package.json package-lock.json`, { stdio: 'inherit' });
  execSync(`git commit -m "v${newVer}"`, { stdio: 'inherit' });
  execSync(`git tag "v${newVer}"`, { stdio: 'inherit' });
  tagCreated = true; // 标记tag已经创建
  execSync(`git push ElectronApp main --tags`, { stdio: 'inherit' });

  console.log('🔼 开始打包并上传 ...');
  execSync('yarn run publish', { stdio: 'inherit' });

  console.log(`✅ 已完成：GitHub Releases 已上传 v${newVer}`);
}
catch (e) {
  console.error('❌ 发布失败:', e.message);
  // 发布失败时回退tag和版本号
  rollback(newVer);
  process.exit(1);
}