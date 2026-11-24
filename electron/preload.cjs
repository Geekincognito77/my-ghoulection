// The bridge between the app's screens and local storage. Only these calls are exposed.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ghoul', {
  listDolls: () => ipcRenderer.invoke('dolls:list'),
  saveDoll: (doll) => ipcRenderer.invoke('dolls:save', doll),
  deleteDoll: (id) => ipcRenderer.invoke('dolls:delete', id),
  addPhotoPaths: (dollId, paths) => ipcRenderer.invoke('photos:add', dollId, paths),
  removePhoto: (photoId) => ipcRenderer.invoke('photos:remove', photoId),
  setCover: (photoId) => ipcRenderer.invoke('photos:cover', photoId),
  exportCsv: () => ipcRenderer.invoke('data:exportCsv'),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  catalogList: () => ipcRenderer.invoke('catalog:list'),
  catalogRefresh: () => ipcRenderer.invoke('catalog:refresh'),
  catalogDetails: (url) => ipcRenderer.invoke('catalog:details', url),
  catalogAdd: (url, status) => ipcRenderer.invoke('catalog:add', url, status),
  onDollsChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('dolls:changed', handler);
    return () => ipcRenderer.removeListener('dolls:changed', handler);
  },
  appVersion: () => ipcRenderer.invoke('app:version'),
  updateState: () => ipcRenderer.invoke('updates:state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateState: (callback) => {
    const handler = (_e, state) => callback(state);
    ipcRenderer.on('updates:state', handler);
    return () => ipcRenderer.removeListener('updates:state', handler);
  },
  cachedReleases: () => ipcRenderer.invoke('releases:cached'),
  checkReleases: () => ipcRenderer.invoke('releases:check'),
  wishlistRelease: (item) => ipcRenderer.invoke('releases:wishlist', item),
});
