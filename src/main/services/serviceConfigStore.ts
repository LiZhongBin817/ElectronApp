import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { LocalServiceConfig } from "./localServiceTypes";

const CONFIG_FILE_NAME = "local-services.json";
const LEGACY_APP_NAMES = ["ElectronApp"];

interface PersistedServiceConfig {
  services: LocalServiceConfig[];
}

const getConfigFilePath = () => path.join(app.getPath("userData"), CONFIG_FILE_NAME);

const getLegacyConfigFilePaths = () => {
  const currentUserDataPath = app.getPath("userData");
  const roamingPath = path.dirname(currentUserDataPath);

  // 应用改名后 userData 目录会变化，这里保留旧目录读取，避免用户升级后配置丢失。
  return LEGACY_APP_NAMES.map((appName) => path.join(roamingPath, appName, CONFIG_FILE_NAME));
};

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const cleanDuplicatedPath = (value?: string) => {
  const trimmedValue = value?.trim() ?? "";

  if (!trimmedValue) {
    return "";
  }

  // 早期表单曾出现路径重复拼接，这里在读取配置时自动修正历史脏数据。
  const halfLength = trimmedValue.length / 2;

  if (Number.isInteger(halfLength)) {
    const firstHalf = trimmedValue.slice(0, halfLength);
    const secondHalf = trimmedValue.slice(halfLength);

    if (firstHalf === secondHalf) {
      return firstHalf;
    }
  }

  return trimmedValue.replace(/(.+?\\bin)\1$/i, "$1");
};

const migrateLegacyConfigIfNeeded = async () => {
  const currentFilePath = getConfigFilePath();

  if (await fileExists(currentFilePath)) {
    return currentFilePath;
  }

  // 新目录没有配置时，从旧应用名目录复制一份到新目录，后续读写都走新文件。
  const legacyFilePaths = getLegacyConfigFilePaths();
  const legacyFilePath = await legacyFilePaths.reduce<Promise<string | undefined>>(
    async (matchedPathPromise, filePath) => {
      const matchedPath = await matchedPathPromise;

      if (matchedPath) {
        return matchedPath;
      }

      return (await fileExists(filePath)) ? filePath : undefined;
    },
    Promise.resolve(undefined),
  );

  if (!legacyFilePath) {
    return currentFilePath;
  }

  await fs.mkdir(path.dirname(currentFilePath), { recursive: true });
  await fs.copyFile(legacyFilePath, currentFilePath);
  return currentFilePath;
};

const normalizeService = (service: LocalServiceConfig): LocalServiceConfig => ({
  ...service,
  // 所有配置入库前统一清洗，保证列表、启动命令和注册中心命令读取到稳定数据。
  id: service.id || randomUUID(),
  name: service.name.trim(),
  cwd: cleanDuplicatedPath(service.cwd),
  startCommand: service.startCommand.trim(),
  stopCommand: service.stopCommand?.trim() || undefined,
  healthCheckUrl: service.healthCheckUrl?.trim() || undefined,
  registryConfig: {
    ...service.registryConfig,
    redisCliPath: cleanDuplicatedPath(service.registryConfig?.redisCliPath),
    zookeeperCliPath: cleanDuplicatedPath(service.registryConfig?.zookeeperCliPath),
  },
});

const readJsonConfig = async (): Promise<PersistedServiceConfig> => {
  const filePath = await migrateLegacyConfigIfNeeded();

  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as Partial<PersistedServiceConfig>;

    // 配置文件损坏或结构不符合预期时，返回空列表，避免渲染层直接崩溃。
    if (!Array.isArray(parsed.services)) {
      return { services: [] };
    }

    return {
      services: parsed.services.map((service) => normalizeService(service)),
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      return { services: [] };
    }

    throw new Error(`读取本地服务配置失败：${nodeError.message}`);
  }
};

const writeJsonConfig = async (config: PersistedServiceConfig) => {
  const filePath = getConfigFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
};

export class ServiceConfigStore {
  async list() {
    const config = await readJsonConfig();
    return config.services;
  }

  async save(service: LocalServiceConfig) {
    const config = await readJsonConfig();
    const nextService = normalizeService({
      ...service,
      id: service.id || randomUUID(),
    });
    const serviceIndex = config.services.findIndex((item) => item.id === nextService.id);

    // 有 id 时更新原配置，无 id 时作为新服务追加。
    if (serviceIndex >= 0) {
      config.services[serviceIndex] = nextService;
    } else {
      config.services.push(nextService);
    }

    await writeJsonConfig(config);
    return nextService;
  }

  async remove(serviceId: string) {
    const config = await readJsonConfig();
    const nextServices = config.services.filter((service) => service.id !== serviceId);

    if (nextServices.length === config.services.length) {
      throw new Error("未找到要删除的服务配置");
    }

    await writeJsonConfig({ services: nextServices });
  }

  async get(serviceId: string) {
    const services = await this.list();
    return services.find((service) => service.id === serviceId);
  }
}
