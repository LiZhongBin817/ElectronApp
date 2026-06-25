const { contextBridge, ipcRenderer } = require('electron');

const versions = {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
};

const appApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getApiRuntimeConfig: () => ipcRenderer.invoke('api:get-runtime-config'),
  setRemoteApiBaseUrl: (value) => ipcRenderer.invoke('api:set-remote-base-url', value),
  useLocalApiBaseUrl: () => ipcRenderer.invoke('api:use-local-base-url'),
  getApiBaseUrl: () => {
    const apiBaseUrl = ipcRenderer.sendSync('api:get-base-url-sync');
    return apiBaseUrl || process.env.TMS_API_BASE_URL || 'http://127.0.0.1:4000/api';
  },
  onUpdaterStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('updater:status', listener);

    return () => {
      ipcRenderer.removeListener('updater:status', listener);
    };
  },
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('versions', versions);
  contextBridge.exposeInMainWorld('$api', appApi);
} else {
  window.versions = versions;
  window.$api = appApi;
}
