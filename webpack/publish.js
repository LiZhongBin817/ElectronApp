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

const tagExists = (tagName) => {
  try {
    output(`git rev-parse --verify --quiet refs/tags/${tagName}`);
    return true;
  } catch {
    return false;
  }
};

const ensureCleanReleaseFiles = () => {
  const status = output('git status --short');
  const blockingChanges = status
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.includes('package.json') && !line.includes('pnpm-lock.yaml'));

  if (blockingChanges.length > 0) {
    throw new Error(`存在未提交改动，请先处理后再发布：\n${blockingChanges.join('\n')}`);
  }
};

const originalPackage = readPackage();
const newVersion = bumpPatchVersion(originalPackage.version);
const tagName = `v${newVersion}`;

try {
  ensureCleanReleaseFiles();

  if (tagExists(tagName)) {
    throw new Error(`本地 tag 已存在：${tagName}`);
  }

  const packageJson = readPackage();
  packageJson.version = newVersion;
  writePackage(packageJson);

  console.log(`[Release] 版本号：${originalPackage.version} -> ${newVersion}`);
  run('git add package.json pnpm-lock.yaml');
  run(`git commit -m "v${newVersion}"`);
  run(`git tag "${tagName}"`);

  const currentBranch = output('git branch --show-current') || 'main';
  run(`git push ${remoteName} ${currentBranch} --tags`);

  console.log(`[Release] 已推送 ${tagName}，GitHub Actions 将负责构建并发布 Release。`);
} catch (error) {
  writePackage(originalPackage);

  try {
    if (tagExists(tagName)) {
      run(`git tag -d "${tagName}"`);
    }
  } catch {
    // tag 回滚失败时只保留原始错误。
  }

  console.error('[Release] 发布失败：', error.message);
  process.exit(1);
}
