/**
 * 桌面端 API 运行模式配置：默认使用内置本地服务，也可切换到 PC 端共享后端。
 */
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface ApiRuntimeConfig {
  mode: 'local' | 'remote';
  remoteBaseUrl: string;
  activeBaseUrl: string;
}

const configFileName = 'api-runtime-config.json';

function configPath() {
  return path.join(app.getPath('userData'), configFileName);
}

function legacyConfigPaths() {
  const currentPath = path.resolve(configPath()).toLowerCase();
  return ['ElectronApp', 'Electron_App']
    .map((name) => path.join(app.getPath('appData'), name, configFileName))
    .filter((filePath) => path.resolve(filePath).toLowerCase() !== currentPath);
}

function normalizeApiBaseUrl(value: string) {
  const text = String(value || '').trim();
  if (!text) return '';
  const withProtocol = /^https?:\/\//i.test(text) ? text : `http://${text}`;
  return withProtocol.replace(/\/+$/, '').replace(/\/api$/i, '') + '/api';
}

async function verifyRemoteApiBaseUrl(remoteBaseUrl: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${remoteBaseUrl}/auth/login-config`, {
      method: 'GET',
      signal: controller.signal
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      throw new Error('共享后端地址不是有效 API，请填写类似 http://电脑IP:4000/api 的地址');
    }

    const payload = await response.json() as { providers?: unknown; localLoginEnabled?: unknown };
    if (!Array.isArray(payload.providers) || typeof payload.localLoginEnabled !== 'boolean') {
      throw new Error('共享后端接口返回格式不正确，请确认 PC 端后端服务版本一致');
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('共享后端连接超时，请确认 PC 端服务已启动且网络可访问');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function readConfigFileByPath(filePath: string): Pick<ApiRuntimeConfig, 'mode' | 'remoteBaseUrl'> | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as Partial<ApiRuntimeConfig>;
    return {
      mode: parsed.mode === 'remote' ? 'remote' : 'local',
      remoteBaseUrl: normalizeApiBaseUrl(parsed.remoteBaseUrl || '')
    };
  } catch {
    return undefined;
  }
}

function readConfigFile() {
  const currentConfig = readConfigFileByPath(configPath());
  if (currentConfig) {
    return currentConfig;
  }

  for (const filePath of legacyConfigPaths()) {
    const legacyConfig = readConfigFileByPath(filePath);
    if (legacyConfig) {
      writeConfigFile(legacyConfig);
      return legacyConfig;
    }
  }

  return { mode: 'local' as const, remoteBaseUrl: '' };
}

function writeConfigFile(input: Pick<ApiRuntimeConfig, 'mode' | 'remoteBaseUrl'>) {
  const filePath = configPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(input, null, 2));
}

export function getApiRuntimeConfig(): ApiRuntimeConfig {
  const fileConfig = readConfigFile();
  const envRemoteUrl = normalizeApiBaseUrl(process.env.TMS_REMOTE_API_BASE_URL || '');
  const remoteBaseUrl = envRemoteUrl || fileConfig.remoteBaseUrl;
  const mode = envRemoteUrl || fileConfig.mode === 'remote'
    ? 'remote'
    : 'local';
  const activeBaseUrl = mode === 'remote' && remoteBaseUrl
    ? remoteBaseUrl
    : process.env.TMS_API_BASE_URL || 'http://127.0.0.1:4000/api';

  return {
    mode: mode === 'remote' && remoteBaseUrl ? 'remote' : 'local',
    remoteBaseUrl,
    activeBaseUrl
  };
}

export async function saveRemoteApiBaseUrl(value: string) {
  const remoteBaseUrl = normalizeApiBaseUrl(value);
  if (!remoteBaseUrl) {
    throw new Error('请输入有效的共享后端地址');
  }

  await verifyRemoteApiBaseUrl(remoteBaseUrl);

  const next = { mode: 'remote' as const, remoteBaseUrl };
  writeConfigFile(next);
  process.env.TMS_API_BASE_URL = remoteBaseUrl;
  return getApiRuntimeConfig();
}

export function useLocalApiBaseUrl() {
  writeConfigFile({ mode: 'local', remoteBaseUrl: '' });
  delete process.env.TMS_REMOTE_API_BASE_URL;
  delete process.env.TMS_API_BASE_URL;
  return getApiRuntimeConfig();
}
