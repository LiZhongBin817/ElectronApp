import { ipcMain } from "electron";
import { LocalServiceManager } from "../services/localServiceManager";
import type { LocalServiceConfig } from "../services/localServiceTypes";

const manager = new LocalServiceManager();

const safeHandle = <TArgs extends readonly unknown[], TResponse>(
  channel: string,
  handler: (...args: TArgs) => Promise<TResponse>,
) => {
  // 所有本地服务 IPC 都走统一响应结构，渲染层只需要判断 success/data/message。
  ipcMain.handle(channel, async (_event, ...args: TArgs) => {
    try {
      return {
        success: true,
        data: await handler(...args),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";

      return {
        success: false,
        message,
      };
    }
  });
};

export const registerServiceIpc = () => {
  // 配置增删改查。
  safeHandle("local-service:list", () => manager.listServices());
  safeHandle("local-service:save", (service: LocalServiceConfig) => manager.saveService(service));
  safeHandle("local-service:remove", (serviceId: string) => manager.removeService(serviceId));
  // 服务运行状态和生命周期操作。
  safeHandle("local-service:statuses", () => manager.getStatuses());
  safeHandle("local-service:start", (serviceId: string) => manager.startService(serviceId));
  safeHandle("local-service:stop", (serviceId: string) => manager.stopService(serviceId));
  safeHandle("local-service:restart", (serviceId: string) => manager.restartService(serviceId));
  // 注册中心信息读取，内部按 Nacos/Zookeeper/Redis 分派。
  safeHandle("local-service:registry", (serviceId: string) =>
    manager.getRegisteredServices(serviceId),
  );
};
