import { ChildProcess, exec, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import type {
  LocalServiceConfig,
  LocalServiceStatus,
  RegistryResult,
  ServiceOperationResult,
} from "./localServiceTypes";
import { ServiceConfigStore } from "./serviceConfigStore";
import { checkHttpHealth, checkPortOpen } from "./healthChecker";
import {
  getNacosRegisteredServices,
  getRedisInfo,
  getZookeeperRegisteredServices,
} from "./registryAdapters";

const execAsync = promisify(exec);
const DEFAULT_START_WAIT_TIMEOUT = 15000;
const SLOW_SERVICE_START_WAIT_TIMEOUT = 60000;
const START_CHECK_INTERVAL = 500;

interface ManagedProcess {
  pid: number;
  process: ChildProcess;
  startedAt: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitUntil = async (checker: () => Promise<boolean>, timeout: number, interval: number) => {
  const startTime = Date.now();

  // 启动、停止这类操作都不是瞬时完成，通过轮询把“命令已执行”和“服务可用”分开判断。
  while (Date.now() - startTime < timeout) {
    if (await checker()) {
      return true;
    }

    await delay(interval);
  }

  return false;
};

const getPortProcessId = async (port: number) => {
  if (process.platform !== "win32") {
    return undefined;
  }

  try {
    // Windows 下通过 netstat 反查监听端口的 PID，用于展示状态和停止非托管进程。
    const { stdout } = await execAsync(`netstat -ano -p tcp | findstr ":${port}"`);
    const listenLine = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => {
        const parts = line.split(/\s+/);
        return parts[0] === "TCP" && parts[1]?.endsWith(`:${port}`) && parts[3] === "LISTENING";
      });

    if (!listenLine) {
      return undefined;
    }

    const pid = Number(listenLine.split(/\s+/).at(-1));
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
};

const ensureWorkDirExists = async (cwd?: string) => {
  if (!cwd) {
    return;
  }

  try {
    const stat = await fs.stat(cwd);

    if (!stat.isDirectory()) {
      throw new Error("工作目录不是有效文件夹");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    throw new Error(`工作目录不可用：${cwd}，${message}`);
  }
};

const pathExists = async (targetPath: string) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const getJavaHomeCandidates = () => [
  process.env.JAVA_HOME,
  "C:\\Program Files\\Java\\jdk1.8.0_171",
  "C:\\Program Files\\Java\\jdk-21",
  "C:\\Program Files\\Java",
  "C:\\Program Files (x86)\\Java",
];

const findJavaHome = async () => {
  const candidates = getJavaHomeCandidates().filter(Boolean) as string[];

  // 优先使用用户环境变量；没有配置时扫描常见 JDK 目录，解决双击 Electron 后 JAVA_HOME 丢失的问题。
  for (const candidate of candidates) {
    const javaPath = `${candidate}\\bin\\java.exe`;

    if (await pathExists(javaPath)) {
      return candidate;
    }

    if (!(await pathExists(candidate))) {
      continue;
    }

    const stat = await fs.stat(candidate);

    if (!stat.isDirectory()) {
      continue;
    }

    const children = await fs.readdir(candidate, { withFileTypes: true });
    for (const child of children) {
      if (!child.isDirectory()) {
        continue;
      }

      const childPath = `${candidate}\\${child.name}`;

      if (await pathExists(`${childPath}\\bin\\java.exe`)) {
        return childPath;
      }
    }
  }

  return undefined;
};

const buildServiceEnv = async (service: LocalServiceConfig) => {
  const javaHome = service.type === "zookeeper" ? await findJavaHome() : process.env.JAVA_HOME;

  // Windows 批处理依赖 SystemRoot/ComSpec；Electron 环境不完整时手动补齐。
  return {
    ...process.env,
    SystemRoot: process.env.SystemRoot || "C:\\Windows",
    ComSpec: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  };
};

const getStartWaitTimeout = (service: LocalServiceConfig) =>
  service.type === "zookeeper" || service.type === "nacos"
    ? SLOW_SERVICE_START_WAIT_TIMEOUT
    : DEFAULT_START_WAIT_TIMEOUT;

const appendProcessOutput = (currentOutput: string, chunk: Buffer | string) => {
  const nextOutput = `${currentOutput}${chunk.toString()}`;
  // 只保留最近输出，避免服务启动日志过大撑爆 IPC 返回。
  return nextOutput.slice(-1200).trim();
};

const isProcessAlive = (pid?: number) => {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const killProcessTree = (pid: number) =>
  process.platform === "win32"
    ? execAsync(`taskkill /PID ${pid} /T /F`).then(() => undefined)
    : new Promise<void>((resolve, reject) => {
        try {
          process.kill(pid, "SIGTERM");
          resolve();
        } catch (error) {
          reject(error);
        }
      });

export class LocalServiceManager {
  private readonly store = new ServiceConfigStore();

  // 只记录由当前应用启动的进程；手动启动的服务通过端口探测识别。
  private readonly managedProcesses = new Map<string, ManagedProcess>();

  async listServices() {
    return this.store.list();
  }

  async saveService(service: LocalServiceConfig) {
    return this.store.save(service);
  }

  async removeService(serviceId: string) {
    await this.stopService(serviceId);
    await this.store.remove(serviceId);
  }

  async getStatuses() {
    const services = await this.store.list();
    return Promise.all(services.map((service) => this.getStatus(service)));
  }

  async getStatus(serviceOrId: LocalServiceConfig | string): Promise<LocalServiceStatus> {
    const service = await this.resolveService(serviceOrId);
    const managedProcess = this.managedProcesses.get(service.id);
    const managedAlive = isProcessAlive(managedProcess?.pid);

    // 子进程已退出时立即清理托管记录，避免状态显示“当前应用启动”。
    if (managedProcess && !managedAlive) {
      this.managedProcesses.delete(service.id);
    }

    // 服务是否运行以端口监听为准；HTTP 健康检查只作为更细的 healthy 判断。
    const portOpen = await checkPortOpen("127.0.0.1", service.port);
    const portProcessId = portOpen ? await getPortProcessId(service.port) : undefined;
    const httpHealthy = service.healthCheckUrl
      ? await checkHttpHealth(service.healthCheckUrl)
      : portOpen;
    const running = managedAlive || portOpen;

    return {
      id: service.id,
      running,
      managed: managedAlive,
      portOpen,
      healthy: running && httpHealthy,
      pid: managedAlive ? managedProcess?.pid : portProcessId,
      message: running ? "服务运行中" : "服务未运行",
    };
  }

  async startService(serviceId: string): Promise<ServiceOperationResult> {
    const service = await this.resolveService(serviceId);

    if (!service.startCommand) {
      return {
        success: false,
        message: "请先配置启动命令",
      };
    }

    try {
      await ensureWorkDirExists(service.cwd);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "工作目录不可用",
      };
    }

    const currentStatus = await this.getStatus(service);

    // 已有端口监听时不重复启动，避免同一服务多进程抢端口。
    if (currentStatus.running) {
      return {
        success: true,
        message: "服务已经在运行",
        status: currentStatus,
      };
    }

    const childProcess = spawn(service.startCommand, {
      cwd: service.cwd || undefined,
      shell: process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : true,
      detached: false,
      windowsHide: true,
      env: await buildServiceEnv(service),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let startOutput = "";

    // 捕获启动脚本输出，启动失败时把 JAVA_HOME、端口占用等真实原因回传到界面。
    childProcess.stdout?.on("data", (chunk) => {
      startOutput = appendProcessOutput(startOutput, chunk);
    });
    childProcess.stderr?.on("data", (chunk) => {
      startOutput = appendProcessOutput(startOutput, chunk);
    });
    const spawnError = await new Promise<Error | null>((resolve) => {
      childProcess.once("error", (error) => resolve(error));
      setTimeout(() => resolve(null), 200);
    });

    if (spawnError) {
      return {
        success: false,
        message: `启动进程失败：${spawnError.message}`,
      };
    }

    if (!childProcess.pid) {
      return {
        success: false,
        message: "启动失败，未获取到进程 PID",
      };
    }

    this.managedProcesses.set(service.id, {
      pid: childProcess.pid,
      process: childProcess,
      startedAt: Date.now(),
    });

    // 服务脚本自行退出时同步清理托管状态，后续仍可通过端口识别外部存活服务。
    childProcess.once("exit", () => {
      this.managedProcesses.delete(service.id);
    });
    childProcess.once("error", () => {
      this.managedProcesses.delete(service.id);
    });

    await waitUntil(async () => {
      const nextStatus = await this.getStatus(service);
      return nextStatus.running && nextStatus.healthy;
    }, getStartWaitTimeout(service), START_CHECK_INTERVAL);

    const status = await this.getStatus(service);
    const commandStillRunning = isProcessAlive(childProcess.pid);

    // 有些脚本会先拉起后台服务再退出，所以 success 同时考虑端口状态和命令进程状态。
    return {
      success: status.running || commandStillRunning,
      message: status.running
        ? "服务启动成功"
        : commandStillRunning
          ? "启动命令已提交，服务仍在启动中，请稍后刷新状态"
          : startOutput
            ? `启动命令已退出，端口未监听：${startOutput}`
            : "启动命令已执行，但端口暂未监听，请检查服务日志",
      status,
    };
  }

  async stopService(serviceId: string): Promise<ServiceOperationResult> {
    const service = await this.resolveService(serviceId);
    const managedProcess = this.managedProcesses.get(service.id);
    const currentStatus = await this.getStatus(service);

    if (service.stopCommand) {
      await ensureWorkDirExists(service.cwd);
      // 优先使用用户配置的停止命令，兼容 Zookeeper/Nacos/Redis 各自的官方停止方式。
      await execAsync(service.stopCommand, {
        cwd: service.cwd || undefined,
        windowsHide: true,
        env: await buildServiceEnv(service),
      });
      await waitUntil(async () => !(await this.getStatus(service)).running, 8000, 500);
      let status = await this.getStatus(service);

      // 停止命令执行后端口仍监听时，按端口 PID 兜底结束进程树。
      if (status.running && status.pid && status.pid !== process.pid) {
        await killProcessTree(status.pid);
        this.managedProcesses.delete(service.id);
        await waitUntil(async () => !(await this.getStatus(service)).running, 5000, 500);
        status = await this.getStatus(service);
      }

      return {
        success: !status.running,
        message: status.running ? "停止命令已执行，但端口仍在监听，请检查进程权限" : "服务已停止",
        status,
      };
    }

    const targetPid = managedProcess?.pid || currentStatus.pid;

    // 没有停止命令时，只结束可确认的托管进程或端口监听进程，避免误杀无关进程。
    if (targetPid && isProcessAlive(targetPid)) {
      await killProcessTree(targetPid);
      this.managedProcesses.delete(service.id);
      await waitUntil(async () => !(await this.getStatus(service)).running, 5000, 500);
      const status = await this.getStatus(service);

      return {
        success: !status.running,
        message: status.running ? "已结束托管进程，但端口仍被占用" : "服务已停止",
        status,
      };
    }

    const status = await this.getStatus(service);

    return {
      success: !status.running,
      message: status.running
        ? "该服务不是由当前应用启动，且未配置停止命令，已拒绝误杀进程"
        : "服务未运行",
      status,
    };
  }

  async restartService(serviceId: string): Promise<ServiceOperationResult> {
    await this.stopService(serviceId);
    return this.startService(serviceId);
  }

  async getRegisteredServices(serviceId: string): Promise<RegistryResult> {
    const service = await this.resolveService(serviceId);

    // 注册信息按服务类型分派：Nacos 走 HTTP API，Zookeeper/Redis 走本地 CLI。
    if (service.type === "nacos") {
      return getNacosRegisteredServices(service);
    }

    if (service.type === "zookeeper") {
      return getZookeeperRegisteredServices(service);
    }

    return getRedisInfo(service);
  }

  private async resolveService(serviceOrId: LocalServiceConfig | string) {
    if (typeof serviceOrId !== "string") {
      return serviceOrId;
    }

    const service = await this.store.get(serviceOrId);

    if (!service) {
      throw new Error("未找到服务配置");
    }

    return service;
  }
}
