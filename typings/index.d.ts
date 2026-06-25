
// 二级环境变量
declare const Env_Local: boolean;
declare const Env_Test: boolean;

interface AppBridgeApi {
  invoke<TResponse>(channel: string, ...args: readonly unknown[]): Promise<TResponse>;
  getAppVersion(): Promise<string>;
  getApiRuntimeConfig(): Promise<ApiRuntimeConfig>;
  setRemoteApiBaseUrl(value: string): Promise<ApiRuntimeConfig>;
  useLocalApiBaseUrl(): Promise<ApiRuntimeConfig>;
  getApiBaseUrl(): string;
  onUpdaterStatus(callback: (status: UpdaterStatus) => void): () => void;
}

interface ApiRuntimeConfig {
  mode: "local" | "remote";
  remoteBaseUrl: string;
  activeBaseUrl: string;
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

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

declare module "*.svg" {
  const source: string;
  export default source;
}
