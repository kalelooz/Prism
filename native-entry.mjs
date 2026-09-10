import { parse, readLibrary } from './theme.mjs';
const { invoke } = window.__TAURI__.core;
const call = (action, args = {}) => invoke('prism', { action, args }).catch(error => { throw new Error(String(error)); });
window.prism = {
  openProjectLink: name => call('project-link', { name }),
  quit: () => call('quit'),
  onQuitRequested: callback => window.__TAURI__.event.listen('quit-requested', callback),
  copy: text => { parse(text); return call('copy', { text }); },
  saveThemeFile: text => { parse(text); return call('export', { text }); },
  fonts: () => call('fonts'),
  openSettings: () => call('settings'),
  openTaskManager: () => call('task-manager'),
  chooseImage: area => call('image', { area }),
  backgrounds: () => call('backgrounds'),
  loadBackground: id => call('load', { id }),
  saveBackground: (options, name) => call('save', { options, name }),
  applyWallpaper: options => call('apply', { options }),
  removeWallpaper: () => call('remove'),
  startWallpaper: () => call('start'),
  checkBackgroundConnection: () => call('connection'),
  cancelBackgroundStart: () => call('cancel-start'),
  setBackgroundStartup: value => call('startup', { value }),
  onBackgroundStatus: callback => {
    const ready = window.__TAURI__.event.listen('background-status', event => callback(event.payload));
    return () => { ready.then(unlisten => unlisten()); };
  }
};
let migrationError;
try {
  const raw = await call('migrated-library');
  if (raw && localStorage.getItem('prism.library.v1') === null) {
    readLibrary({ getItem: () => raw });
    localStorage.setItem('prism.library.v1', raw);
  }
} catch (error) {
  migrationError = error;
}
await import('./app.mjs');
if (migrationError) { document.getElementById('status').textContent = `Saved palette migration needs attention: ${migrationError.message}`; }
