/**
 * 本地 API 服务启动器：为桌面端准备持久化目录、默认配置和可用端口。
 */
import { app } from 'electron';
import fs from 'fs';
import http from 'http';
import path from 'path';

interface LocalApiServerState {
  baseUrl: string;
  server: http.Server;
}

const DEFAULT_API_PORT = 4000;
let serverState: LocalApiServerState | null = null;

function ensureStableSecret(dataDir: string) {
  const secretPath = path.join(dataDir, 'jwt-secret.txt');

  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf8').trim();
  }

  const secret = `${Date.now()}-${Math.random().toString(36).slice(2)}-${app.getPath('userData')}`;
  fs.writeFileSync(secretPath, secret);
  return secret;
}

function prepareRuntimeEnv(frontendBaseUrl: string) {
  const dataDir = path.join(app.getPath('userData'), 'time-manage-system');
  fs.mkdirSync(dataDir, { recursive: true });

  process.env.DB_PATH ||= path.join(dataDir, 'server-data.db');
  process.env.JWT_SECRET ||= ensureStableSecret(dataDir);
  process.env.LOCAL_LOGIN_ENABLED ||= 'true';
  process.env.DEFAULT_USER_PASSWORD ||= '123456';
  process.env.FRONTEND_BASE_URL ||= frontendBaseUrl.replace(/\/+$/, '');
}

function listen(server: http.Server, port: number) {
  return new Promise<number>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

export async function startLocalApiServer(frontendBaseUrl: string) {
  if (serverState) {
    return `${serverState.baseUrl}/api`;
  }

  prepareRuntimeEnv(frontendBaseUrl);

  const { createElectronApiApp } = await import('../server/electronServer');
  const apiApp = await createElectronApiApp();
  const server = http.createServer(apiApp);

  let port = DEFAULT_API_PORT;
  try {
    port = await listen(server, DEFAULT_API_PORT);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
      throw error;
    }
    port = await listen(server, 0);
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  process.env.PUBLIC_BASE_URL ||= baseUrl;
  process.env.SERVER_PUBLIC_BASE_URL ||= baseUrl;
  process.env.TMS_API_BASE_URL = `${baseUrl}/api`;

  serverState = { baseUrl, server };
  console.log(`[TMS] API server listening on ${baseUrl}`);

  return process.env.TMS_API_BASE_URL;
}

export function getLocalApiBaseUrl() {
  return serverState ? `${serverState.baseUrl}/api` : process.env.TMS_API_BASE_URL || '';
}

export function stopLocalApiServer() {
  if (!serverState) {
    return;
  }

  serverState.server.close();
  serverState = null;
}
