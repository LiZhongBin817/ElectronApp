const { contextBridge, ipcRenderer } = require('electron');

const versions = {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
};

const appApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  listLocalServices: () => ipcRenderer.invoke('local-service:list'),
  saveLocalService: (service) => ipcRenderer.invoke('local-service:save', service),
  removeLocalService: (serviceId) => ipcRenderer.invoke('local-service:remove', serviceId),
  getLocalServiceStatuses: () => ipcRenderer.invoke('local-service:statuses'),
  startLocalService: (serviceId) => ipcRenderer.invoke('local-service:start', serviceId),
  stopLocalService: (serviceId) => ipcRenderer.invoke('local-service:stop', serviceId),
  restartLocalService: (serviceId) => ipcRenderer.invoke('local-service:restart', serviceId),
  getRegisteredServices: (serviceId) => ipcRenderer.invoke('local-service:registry', serviceId),
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
