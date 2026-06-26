export type LocalServiceType = "redis" | "zookeeper" | "nacos";

// 注册中心读取所需的连接信息；不同服务类型只使用其中一部分字段。
export interface RegistryConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  namespaceId?: string;
  groupName?: string;
  clusterName?: string;
  rootPath?: string;
  redisCliPath?: string;
  zookeeperCliPath?: string;
  redisKeyPattern?: string;
}

export interface LocalServiceConfig {
  id: string;
  name: string;
  type: LocalServiceType;
  cwd: string;
  startCommand: string;
  stopCommand?: string;
  port: number;
  healthCheckUrl?: string;
  // Redis/Zookeeper/Nacos 的注册信息读取配置，跟启动命令配置分开维护。
  registryConfig?: RegistryConfig;
}

export interface LocalServiceStatus {
  id: string;
  running: boolean;
  // managed 表示进程由当前应用启动；false 也可能是外部手动启动但端口已监听。
  managed: boolean;
  portOpen: boolean;
  healthy: boolean;
  pid?: number;
  message: string;
}

export interface RegisteredServiceInstance {
  ip?: string;
  port?: number;
  healthy?: boolean;
  metadata?: Record<string, string>;
}

export interface RegisteredServiceItem {
  name: string;
  group?: string;
  namespace?: string;
  path?: string;
  instances?: RegisteredServiceInstance[];
}

export interface RedisInfo {
  version?: string;
  mode?: string;
  connectedClients?: number;
  usedMemoryHuman?: string;
  keyspace?: string[];
}

export interface RegistryResult {
  serviceId: string;
  type: LocalServiceType;
  items: RegisteredServiceItem[];
  redisInfo?: RedisInfo;
  message: string;
  // 仅用于排查 CLI、rootPath、输出解析等问题，前端默认折叠展示。
  debugInfo?: Record<string, string | number | boolean | undefined>;
}

export interface ServiceOperationResult {
  success: boolean;
  message: string;
  status?: LocalServiceStatus;
}
