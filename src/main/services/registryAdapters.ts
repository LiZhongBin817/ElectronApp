import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import type {
  LocalServiceConfig,
  RedisInfo,
  RegisteredServiceInstance,
  RegisteredServiceItem,
  RegistryResult,
} from "./localServiceTypes";

const execAsync = promisify(exec);
const ZOOKEEPER_ADAPTER_VERSION = "20260626-zk-debug";

interface CommandResult {
  stdout: string;
  stderr: string;
  output: string;
}

interface ZookeeperCandidateDebugInfo {
  rootPath: string;
  missing: boolean;
  outputLength: number;
  outputLineCount: number;
  parsedPathCount: number;
  outputPreview: string;
}

interface NacosLoginResponse {
  accessToken?: string;
}

interface NacosServiceListResponse {
  serviceList?: Array<{
    name?: string;
    groupName?: string;
  }>;
  count?: number;
}

interface NacosInstanceListResponse {
  hosts?: Array<{
    ip?: string;
    port?: number;
    healthy?: boolean;
    metadata?: Record<string, string>;
  }>;
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMessage: string, timeout = 5000) => {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeout);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const appendParam = (params: URLSearchParams, key: string, value?: string | number) => {
  if (value === undefined || value === null || value === "") {
    return;
  }

  params.set(key, String(value));
};

const stripWrappingQuotes = (value: string) => value.trim().replace(/^["']|["']$/g, "");

const quoteCommandPart = (value: string) => `"${stripWrappingQuotes(value).replace(/"/g, '\\"')}"`;

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

  for (const candidate of candidates) {
    if (await pathExists(`${candidate}\\bin\\java.exe`)) {
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
    const javaChild = children.find((child) => child.isDirectory());

    if (!javaChild) {
      continue;
    }

    const childPath = `${candidate}\\${javaChild.name}`;

    if (await pathExists(`${childPath}\\bin\\java.exe`)) {
      return childPath;
    }
  }

  return undefined;
};

const buildCommandEnv = async () => {
  const javaHome = await findJavaHome();

  return {
    ...process.env,
    SystemRoot: process.env.SystemRoot || "C:\\Windows",
    ComSpec: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  };
};

const runShellCommand = async (commandParts: string[], cwd?: string): Promise<CommandResult> => {
  const command = commandParts.map(quoteCommandPart).join(" ");
  // zkCli/redis-cli 都通过本地命令执行；这里统一补全 Windows 环境并合并 stdout/stderr。
  const result = await withTimeout(
    execAsync(command, {
      cwd: cwd || undefined,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      env: await buildCommandEnv(),
    }),
    "命令执行超时",
    15000,
  );

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    output: `${result.stdout}\n${result.stderr}`,
  };
};

const getNacosBaseUrl = (service: LocalServiceConfig) => {
  const host = service.registryConfig?.host || "127.0.0.1";
  const port = service.registryConfig?.port || service.port || 8848;

  return `http://${host}:${port}`;
};

const getNacosAccessToken = async (service: LocalServiceConfig) => {
  const username = service.registryConfig?.username;
  const password = service.registryConfig?.password;

  if (!username || !password) {
    // Nacos 关闭鉴权或本地开发环境常不需要登录，此时后续接口不带 accessToken。
    return undefined;
  }

  const params = new URLSearchParams();
  params.set("username", username);
  params.set("password", password);

  const response = await fetch(`${getNacosBaseUrl(service)}/nacos/v1/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    throw new Error(`Nacos 登录失败：HTTP ${response.status}`);
  }

  const data = (await response.json()) as NacosLoginResponse;
  return data.accessToken;
};

const fetchNacosInstances = async (
  service: LocalServiceConfig,
  serviceName: string,
  accessToken?: string,
) => {
  // 先拿服务目录，再逐个拉实例，便于前端展示健康状态和实例地址。
  const params = new URLSearchParams();
  appendParam(params, "serviceName", serviceName);
  appendParam(params, "groupName", service.registryConfig?.groupName);
  appendParam(params, "namespaceId", service.registryConfig?.namespaceId);
  appendParam(params, "clusters", service.registryConfig?.clusterName);
  appendParam(params, "accessToken", accessToken);

  const response = await fetch(`${getNacosBaseUrl(service)}/nacos/v1/ns/instance/list?${params}`);

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as NacosInstanceListResponse;
  return (data.hosts ?? []).map<RegisteredServiceInstance>((host) => ({
    ip: host.ip,
    port: host.port,
    healthy: host.healthy,
    metadata: host.metadata,
  }));
};

export const getNacosRegisteredServices = async (
  service: LocalServiceConfig,
): Promise<RegistryResult> => {
  const accessToken = await getNacosAccessToken(service);
  const params = new URLSearchParams();
  params.set("pageNo", "1");
  params.set("pageSize", "500");
  appendParam(params, "namespaceId", service.registryConfig?.namespaceId);
  appendParam(params, "groupName", service.registryConfig?.groupName);
  appendParam(params, "accessToken", accessToken);

  const response = await fetch(`${getNacosBaseUrl(service)}/nacos/v1/ns/catalog/services?${params}`);

  if (!response.ok) {
    throw new Error(`获取 Nacos 服务列表失败：HTTP ${response.status}`);
  }

  const data = (await response.json()) as NacosServiceListResponse;
  const services = data.serviceList ?? [];
  // Nacos 服务列表接口不直接返回实例详情，所以这里并发补齐实例列表。
  const items = await Promise.all(
    services.map(async (item) => {
      const name = item.name || "";
      const instances = name ? await fetchNacosInstances(service, name, accessToken) : [];

      return {
        name,
        group: item.groupName || service.registryConfig?.groupName,
        namespace: service.registryConfig?.namespaceId,
        instances,
      };
    }),
  );

  return {
    serviceId: service.id,
    type: "nacos",
    items,
    message: `已获取 ${items.length} 个 Nacos 服务`,
  };
};

const normalizeRootPath = (rootPath?: string) => {
  if (!rootPath || rootPath.trim() === "") {
    return "/services";
  }

  const trimmedRootPath = rootPath.trim();
  return trimmedRootPath.startsWith("/") ? trimmedRootPath : `/${trimmedRootPath}`;
};

const isZookeeperListLine = (line: string) => {
  if (!line.startsWith("[") || !line.endsWith("]")) {
    return false;
  }

  // zkCli 会输出日志行和 WATCHER 事件，真正的 ls 结果是形如 [a, b, c] 的节点列表。
  return !/^\[[^\]]*:\]/.test(line) && !line.includes("WATCHER::");
};

const parseZookeeperPaths = (output: string, rootPath: string) => {
  // 兼容两类输出：递归路径输出（/a/b）和 Zookeeper 3.4.x 的单行列表输出（[a, b]）。
  const paths = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("/"));

  if (paths.length > 0) {
    return paths;
  }

  const listLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isZookeeperListLine)
    .at(-1);

  if (!listLine) {
    return [];
  }

  const normalizedRootPath = rootPath.replace(/\/$/, "");
  return listLine
    .slice(1, -1)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => `${normalizedRootPath}/${name}`);
};

const parseZookeeperMissingPath = (output: string) =>
  /Node does not exist|KeeperErrorCode = NoNode/i.test(output);

const getZookeeperCandidateRootPaths = (rootPath: string) => {
  const defaultPaths = ["/dubbo", "/services", "/zookeeper"];

  // 用户配置优先；为空或配置错时再尝试常见注册根路径，降低首次配置成本。
  return [
    rootPath,
    ...defaultPaths.filter((path) => path !== rootPath),
  ];
};

export const getZookeeperRegisteredServices = async (
  service: LocalServiceConfig,
): Promise<RegistryResult> => {
  const cliPath = service.registryConfig?.zookeeperCliPath || "zkCli.cmd";
  const host = service.registryConfig?.host || "127.0.0.1";
  const port = service.registryConfig?.port || service.port || 2181;
  const rootPath = normalizeRootPath(service.registryConfig?.rootPath);

  try {
    let matchedRootPath = rootPath;
    let paths: string[] = [];
    let lastOutput = "";
    let lastCandidateRootPath = rootPath;
    const candidateDebugInfo: ZookeeperCandidateDebugInfo[] = [];

    // 逐个 rootPath 调用 zkCli ls，命中第一个可解析出节点的路径后停止。
    for (const candidateRootPath of getZookeeperCandidateRootPaths(rootPath)) {
      const args = ["-server", `${host}:${port}`, "ls", candidateRootPath];
      const { output } = await runShellCommand([cliPath, ...args], service.cwd);
      lastOutput = output;
      lastCandidateRootPath = candidateRootPath;
      const missing = parseZookeeperMissingPath(output);
      const candidatePaths = missing ? [] : parseZookeeperPaths(output, candidateRootPath);

      // 调试信息默认折叠，仅在排查 JAVA_HOME、路径或输出解析问题时展示。
      candidateDebugInfo.push({
        rootPath: candidateRootPath,
        missing,
        outputLength: output.length,
        outputLineCount: output.split(/\r?\n/).length,
        parsedPathCount: candidatePaths.length,
        outputPreview: output.slice(-300),
      });

      if (missing) {
        continue;
      }

      paths = candidatePaths;

      if (paths.length > 0) {
        matchedRootPath = candidateRootPath;
        break;
      }
    }

    const items = paths.map<RegisteredServiceItem>((path) => ({
      name: path.split("/").filter(Boolean).at(-1) || path,
      path,
    }));

    return {
      serviceId: service.id,
      type: "zookeeper",
      items,
      message: `已从 ${matchedRootPath} 获取 ${items.length} 个 Zookeeper 节点`,
      debugInfo: {
        adapter: ZOOKEEPER_ADAPTER_VERSION,
        cwd: service.cwd,
        cliPath,
        rootPath,
        matchedRootPath,
        lastCandidateRootPath,
        outputLength: lastOutput.length,
        outputLineCount: lastOutput.split(/\r?\n/).length,
        parsedPathCount: paths.length,
        candidateResults: JSON.stringify(candidateDebugInfo),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    throw new Error(
      `获取 Zookeeper 节点失败，请检查 zkCli 路径、工作目录和 rootPath：${message}`,
    );
  }
};

const parseRedisInfo = (stdout: string): RedisInfo => {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim());
  const findValue = (key: string) => {
    const line = lines.find((item) => item.startsWith(`${key}:`));
    return line?.split(":").slice(1).join(":");
  };

  return {
    // Redis 不是注册中心，这里只展示实例基础信息和 keyspace 概览。
    version: findValue("redis_version"),
    mode: findValue("redis_mode"),
    connectedClients: Number(findValue("connected_clients")) || undefined,
    usedMemoryHuman: findValue("used_memory_human"),
    keyspace: lines.filter((line) => /^db\d+:/.test(line)),
  };
};

export const getRedisInfo = async (service: LocalServiceConfig): Promise<RegistryResult> => {
  const cliPath = service.registryConfig?.redisCliPath || "redis-cli";
  const host = service.registryConfig?.host || "127.0.0.1";
  const port = service.registryConfig?.port || service.port || 6379;

  try {
    const { stdout } = await runShellCommand([cliPath, "-h", host, "-p", String(port), "INFO"], service.cwd);
    const redisInfo = parseRedisInfo(stdout);

    return {
      serviceId: service.id,
      type: "redis",
      items: [],
      redisInfo,
      message: "Redis 不是注册中心，已展示实例基础信息",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    throw new Error(`获取 Redis 信息失败，请检查 redis-cli 路径和工作目录：${message}`);
  }
};
