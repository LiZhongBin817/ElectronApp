
// 二级环境变量
declare const Env_Local: boolean;
declare const Env_Test: boolean;

interface AppBridgeApi {
  invoke<TResponse>(channel: string, ...args: readonly unknown[]): Promise<TResponse>;
  getAppVersion(): Promise<string>;
  listLocalServices(): Promise<IpcResponse<LocalServiceConfig[]>>;
  saveLocalService(service: LocalServiceConfig): Promise<IpcResponse<LocalServiceConfig>>;
  removeLocalService(serviceId: string): Promise<IpcResponse<void>>;
  getLocalServiceStatuses(): Promise<IpcResponse<LocalServiceStatus[]>>;
  startLocalService(serviceId: string): Promise<IpcResponse<ServiceOperationResult>>;
  stopLocalService(serviceId: string): Promise<IpcResponse<ServiceOperationResult>>;
  restartLocalService(serviceId: string): Promise<IpcResponse<ServiceOperationResult>>;
  getRegisteredServices(serviceId: string): Promise<IpcResponse<RegistryResult>>;
  onUpdaterStatus(callback: (status: UpdaterStatus) => void): () => void;
}

interface RuntimeVersions {
  node(): string;
  chrome(): string;
  electron(): string;
}

type UpdaterStatusType =
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "cancelled"
  | "error";

interface UpdaterStatus {
  status: UpdaterStatusType;
  message: string;
  timestamp: number;
  version?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

interface Window {
  $api: AppBridgeApi;
  versions: RuntimeVersions;
}

interface IpcResponse<TData> {
  success: boolean;
  data?: TData;
  message?: string;
}

type LocalServiceType = "redis" | "zookeeper" | "nacos";

interface RegistryConfig {
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

interface LocalServiceConfig {
  id: string;
  name: string;
  type: LocalServiceType;
  cwd: string;
  startCommand: string;
  stopCommand?: string;
  port: number;
  healthCheckUrl?: string;
  registryConfig?: RegistryConfig;
}

interface LocalServiceStatus {
  id: string;
  running: boolean;
  managed: boolean;
  portOpen: boolean;
  healthy: boolean;
  pid?: number;
  message: string;
}

interface RegisteredServiceInstance {
  ip?: string;
  port?: number;
  healthy?: boolean;
  metadata?: Record<string, string>;
}

interface RegisteredServiceItem {
  name: string;
  group?: string;
  namespace?: string;
  path?: string;
  instances?: RegisteredServiceInstance[];
}

interface RedisInfo {
  version?: string;
  mode?: string;
  connectedClients?: number;
  usedMemoryHuman?: string;
  keyspace?: string[];
}

interface RegistryResult {
  serviceId: string;
  type: LocalServiceType;
  items: RegisteredServiceItem[];
  redisInfo?: RedisInfo;
  message: string;
  debugInfo?: Record<string, string | number | boolean | undefined>;
}

interface ServiceOperationResult {
  success: boolean;
  message: string;
  status?: LocalServiceStatus;
}
