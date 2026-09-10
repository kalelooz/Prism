const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('prism', {
  openProjectLink: name => ipcRenderer.invoke('prism:project-link', name),
  copy: text => ipcRenderer.invoke('prism:copy', text),
  openSettings: () => ipcRenderer.invoke('prism:settings'),
  openTaskManager: () => ipcRenderer.invoke('prism:task-manager'),
  fonts: () => ipcRenderer.invoke('prism:fonts'),
  chooseImage: area => ipcRenderer.invoke('prism:image', area),
  startWallpaper: () => ipcRenderer.invoke('prism:wallpaper-start'),
  checkBackgroundConnection: () => ipcRenderer.invoke('prism:background-connection'),
  cancelBackgroundStart: () => ipcRenderer.invoke('prism:background-cancel-start'),
  applyWallpaper: options => ipcRenderer.invoke('prism:wallpaper-apply', options),
  removeWallpaper: () => ipcRenderer.invoke('prism:wallpaper-remove'),
  backgrounds: () => ipcRenderer.invoke('prism:backgrounds'),
  loadBackground: id => ipcRenderer.invoke('prism:background-load', id),
  saveBackground: (options, name) => ipcRenderer.invoke('prism:background-save', options, name),
  setBackgroundStartup: value => ipcRenderer.invoke('prism:background-startup', value),
  onBackgroundStatus: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('prism:background-status', listener);
    return () => ipcRenderer.removeListener('prism:background-status', listener);
  }
});
