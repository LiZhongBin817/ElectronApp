#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const remoteName = 'ElectronApp';

const run = (command, args = []) => {
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  });
};

const output = (command, args = []) => execFileSync(command, args, {
  cwd: root,
  encoding: 'utf8',
}).trim();

const runGit = (...args) => run('git', args);

const outputGit = (...args) => output('git', args);

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
    outputGit('rev-parse', '--verify', '--quiet', `refs/tags/${tagName}`);
    return true;
  } catch {
    return false;
  }
};

const hasRemoteTag = (tagName) => {
  try {
    const result = outputGit('ls-remote', '--tags', remoteName, `refs/tags/${tagName}`);
    return result.length > 0;
  } catch (error) {
    throw new Error(`检查远程 tag 失败：${error.message}`);
  }
};

const getCurrentBranch = () => {
  const currentBranch = outputGit('branch', '--show-current');

  if (!currentBranch) {
    throw new Error('当前不在任何分支上，无法发布');
  }

  return currentBranch;
};

const getHeadSha = () => outputGit('rev-parse', 'HEAD');

const getRemoteRefSha = (refName) => {
  const result = outputGit('ls-remote', remoteName, refName);
  return result ? result.split(/\s+/)[0] : '';
};

const getRemoteReleaseState = (branchName, tagName, releaseCommit) => {
  const branchSha = getRemoteRefSha(`refs/heads/${branchName}`);
  const tagSha = getRemoteRefSha(`refs/tags/${tagName}`);
  const branchPushed = branchSha === releaseCommit;
  const tagPushed = tagSha === releaseCommit;

  if (branchPushed && tagPushed) {
    return {
      status: 'complete',
      branchSha,
      tagSha,
    };
  }

  if (!branchPushed && !tagSha) {
    return {
      status: 'none',
      branchSha,
      tagSha,
    };
  }

  return {
    status: 'partial',
    branchSha,
    tagSha,
  };
};

const ensureCleanWorkingTree = () => {
  const status = outputGit('status', '--short');

  if (status) {
    throw new Error(`存在未提交改动，请先提交或清理后再发布：\n${status}`);
  }
};

const deleteLocalTag = (tagName) => {
  if (hasLocalTag(tagName)) {
    runGit('tag', '-d', tagName);
  }
};

const rollbackPackageFile = (originalPackage) => {
  try {
    runGit('restore', '--staged', '--', 'package.json', 'pnpm-lock.yaml');
  } catch {
    // 没有暂存内容时无需处理。
  }

  writePackage(originalPackage);
};

const rollbackLocalRelease = (tagName, releaseCommit) => {
  deleteLocalTag(tagName);

  if (getHeadSha() !== releaseCommit) {
    throw new Error('当前 HEAD 已变化，跳过自动回退版本提交');
  }

  runGit('reset', '--hard', 'HEAD~1');
};

const originalPackage = readPackage();
const newVersion = bumpPatchVersion(originalPackage.version);
const tagName = `v${newVersion}`;
let releaseCommit = '';
let currentBranch = '';
let pushStarted = false;

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
  runGit('add', 'package.json', 'pnpm-lock.yaml');
  runGit('commit', '-m', `v${newVersion}`);
  releaseCommit = getHeadSha();
  runGit('tag', tagName);

  currentBranch = getCurrentBranch();
  pushStarted = true;
  runGit('push', '--atomic', remoteName, currentBranch, tagName);

  console.log(`[Release] 已推送 ${tagName}，GitHub Actions 将负责构建并发布 Release。`);
} catch (error) {
  try {
    if (!releaseCommit) {
      rollbackPackageFile(originalPackage);
      deleteLocalTag(tagName);
    } else if (!pushStarted) {
      rollbackLocalRelease(tagName, releaseCommit);
    } else {
      const remoteState = getRemoteReleaseState(currentBranch, tagName, releaseCommit);

      if (remoteState.status === 'complete') {
        console.log(`[Release] 推送命令返回失败，但远端已存在 ${tagName}，发布视为成功。`);
        process.exit(0);
      }

      if (remoteState.status === 'none') {
        rollbackLocalRelease(tagName, releaseCommit);
        console.log(`[Release] 已回退本地版本提交和 tag：${tagName}`);
      } else {
        console.error('[Release] 远端处于半成功状态，已停止自动回退。');
        console.error(`[Release] 远端分支 ${currentBranch}：${remoteState.branchSha || '未更新'}`);
        console.error(`[Release] 远端 tag ${tagName}：${remoteState.tagSha || '不存在'}`);
      }
    }
  } catch (rollbackError) {
    console.error('[Release] 自动回滚未完成：', rollbackError.message);
    console.error(`[Release] 请确认远端状态后再处理：git ls-remote ${remoteName} ${currentBranch || 'HEAD'} refs/tags/${tagName}`);
  }

  console.error('[Release] 发布失败：', error.message);
  process.exit(1);
}
