
// 二级环境变量
declare const Env_Local: boolean;
declare const Env_Test: boolean;

interface AppBridgeApi {
  invoke<TResponse>(channel: string, ...args: readonly unknown[]): Promise<TResponse>;
  getAppVersion(): Promise<string>;
}

interface RuntimeVersions {
  node(): string;
  chrome(): string;
  electron(): string;
}

interface Window {
  $api: AppBridgeApi;
  versions: RuntimeVersions;
}
