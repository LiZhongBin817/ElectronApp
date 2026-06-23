#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const remoteName = 'ElectronApp';

const run = (command) => {
  execSync(command, {
    cwd: root,
    stdio: 'inherit',
  });
};

const output = (command) => execSync(command, {
  cwd: root,
  encoding: 'utf8',
}).trim();

const readPackage = () => JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const writePackage = (packageJson) => {
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
};

const bumpPatchVersion = (version) => {
  const parts = version.split('.').map(Number);

  if (parts.length !== 3 || parts.some((item) => Number.isNaN(item))) {
    throw new Error(`版本号格式不正确：${version}`);
  }

  const [major, minor, patch] = parts;
  return `${major}.${minor}.${patch + 1}`;
};

const hasLocalTag = (tagName) => {
  try {
    output(`git rev-parse --verify --quiet refs/tags/${tagName}`);
    return true;
  } catch {
    return false;
  }
};

const hasRemoteTag = (tagName) => {
  try {
    const result = output(`git ls-remote --tags ${remoteName} refs/tags/${tagName}`);
    return result.length > 0;
  } catch (error) {
    throw new Error(`检查远程 tag 失败：${error.message}`);
  }
};

const ensureCleanWorkingTree = () => {
  const status = output('git status --short');

  if (status) {
    throw new Error(`存在未提交改动，请先提交或清理后再发布：\n${status}`);
  }
};

const originalPackage = readPackage();
const newVersion = bumpPatchVersion(originalPackage.version);
const tagName = `v${newVersion}`;

try {
  ensureCleanWorkingTree();

  if (hasLocalTag(tagName)) {
    throw new Error(`本地 tag 已存在：${tagName}`);
  }

  if (hasRemoteTag(tagName)) {
    throw new Error(`远程 tag 已存在：${tagName}，请提升版本号后再发布`);
  }

  const packageJson = readPackage();
  packageJson.version = newVersion;
  writePackage(packageJson);

  console.log(`[Release] 版本号：${originalPackage.version} -> ${newVersion}`);
  run('git add package.json pnpm-lock.yaml');
  run(`git commit -m "v${newVersion}"`);
  run(`git tag "${tagName}"`);

  const currentBranch = output('git branch --show-current') || 'main';
  run(`git push ${remoteName} ${currentBranch}`);
  run(`git push ${remoteName} "${tagName}"`);

  console.log(`[Release] 已推送 ${tagName}，GitHub Actions 将负责构建并发布 Release。`);
} catch (error) {
  writePackage(originalPackage);

  try {
    if (hasLocalTag(tagName)) {
      run(`git tag -d "${tagName}"`);
    }
  } catch {
    // 回滚失败时保留原始错误。
  }

  console.error('[Release] 发布失败：', error.message);
  process.exit(1);
}
