
// 二级环境变量
declare const Env_Local: boolean;
declare const Env_Test: boolean;

interface AppBridgeApi {
  invoke<TResponse>(channel: string, ...args: readonly unknown[]): Promise<TResponse>;
  getAppVersion(): Promise<string>;
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
