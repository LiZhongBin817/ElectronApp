/**
 * Electron 内置 API 服务入口：复用原 Express 路由，但把启动权交给主进程。
 */
import cors from 'cors';
import dns from 'dns';
import './env';
import express, { NextFunction, Request, Response } from 'express';
import { failStaleRunningSyncJobs, initDatabase } from './db';
import { router } from './routes';
import { startDingTalkSyncScheduler } from './services/dingtalkSyncScheduler';
import { startNotificationScheduler } from './services/notificationScheduler';

let runtimeStarted = false;

function warnRuntimeConfig() {
  const publicBase = process.env.PUBLIC_BASE_URL || process.env.SERVER_PUBLIC_BASE_URL || '';
  const frontendBase = process.env.FRONTEND_BASE_URL || '';
  const publicIsLocalhost = /localhost|127\.0\.0\.1/.test(publicBase);
  const frontendIsLocalhost = /localhost|127\.0\.0\.1/.test(frontendBase);

  if (publicBase && frontendBase && publicIsLocalhost !== frontendIsLocalhost) {
    console.warn(`[startup-check] PUBLIC_BASE_URL (${publicBase}) and FRONTEND_BASE_URL (${frontendBase}) look inconsistent. OAuth callbacks may return to the wrong host.`);
  }

  if (publicIsLocalhost && process.env.NODE_ENV === 'production') {
    console.warn(`[startup-check] PUBLIC_BASE_URL is ${publicBase}. Production OAuth usually needs a reachable callback URL.`);
  }
}

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    if (frontendBaseUrl) {
      res.redirect(frontendBaseUrl);
      return;
    }

    res.type('text/plain').send('TimeManageSystem API is running. Please open the desktop app or frontend URL.');
  });

  app.use('/api', router);

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    const anyError = err as any;
    const status = anyError.response?.status || 500;
    const upstreamMessage = anyError.response?.data?.message;
    const upstreamCode = anyError.response?.data?.code;

    res.status(status >= 400 && status < 600 ? status : 500).json({
      message: upstreamMessage || err.message || '服务异常',
      code: upstreamCode
    });
  });

  return app;
}

export async function createElectronApiApp() {
  dns.setDefaultResultOrder('ipv4first');

  if (!runtimeStarted) {
    await initDatabase();
    failStaleRunningSyncJobs(30);
    warnRuntimeConfig();
    startDingTalkSyncScheduler();
    startNotificationScheduler();
    runtimeStarted = true;
  }

  return createApp();
}
