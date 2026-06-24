const { contextBridge, ipcRenderer } = require('electron');

const versions = {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
};

const appApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
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
