import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('desktop IPC saves Apply, keeps named copies separate, hides to tray, and gates remembered launches', { timeout: 15000 }, async () => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), 'prism-desktop-test-'));
  const app = new EventEmitter(), handlers = new Map();
  let window, ready, readyResolve, quitError, online = true, diagnostic = 'ready', launchError = false, dialogResponse = 0, launches = 0, shows = 0, prompts = 0, settingsOpens = 0, fontReads = 0, taskManagers = 0;
  ready = new Promise(resolve => { readyResolve = resolve; });
  Object.assign(app, {
    setName() {}, setAppUserModelId() {}, requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(), getPath: () => directory, isPackaged: false,
    getLoginItemSettings: () => ({ openAtLogin: false }), quit: () => app.emit('before-quit')
  });
  class Window extends EventEmitter {
    constructor() { super(); window = this; this.webContents = new EventEmitter(); Object.assign(this.webContents, { mainFrame: { url: '' }, setWindowOpenHandler() {}, send() {} }); }
    removeMenu() {} isDestroyed() { return false; } isMinimized() { return false; }
    show() { this.hidden = false; } hide() { this.hidden = true; } focus() {}
    async loadURL(url) { this.webContents.mainFrame.url = url; readyResolve(); }
  }
  const picture = {
    isEmpty: () => false, getSize: () => ({ width: 100, height: 100 }),
    resize() { return this; }, toJPEG: () => Buffer.from('test-image'),
    toDataURL: () => 'data:image/png;base64,AA=='
  };
  const opened = [], links = { github: 'https://github.com/kalelooz/Prism', support: 'https://buymeacoffee.com/prism' };
  const electron = {
    app, BrowserWindow: Window, ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    clipboard: { writeText() {} }, shell: { async openExternal(url) { opened.push(url); } },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
    nativeImage: { createFromBuffer: () => picture, createFromDataURL: () => picture },
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [join(root, 'icon.png')] }),
      showMessageBox: async () => { prompts++; return { response: dialogResponse }; },
      showErrorBox: (_title, message) => { quitError = message; readyResolve(); }
    },
    Tray: class extends EventEmitter { setToolTip() {} setContextMenu() {} },
    Menu: { buildFromTemplate: value => value }
  };
  const client = {
    endpointAvailable: async () => online,
    connection: async () => ({ code: diagnostic, detail: '' }),
    windows: async action => { if (action === 'Launch') { launches++; if (launchError) throw new Error('Launch failed.'); } if (action === 'Show') shows++; if (action === 'TaskManager') taskManagers++; if (action === 'Settings') settingsOpens++; if (action === 'Fonts') { fontReads++; return { families: ['Arial', 'Consolas'] }; } return { launched: true, opened: true }; },
    operate: async options => { if (!online) throw new Error('Codex is closed.'); return options === null ? { removed: true, appearance: 'rgb(240, 240, 240)' } : { installed: true, appearance: 'rgb(240, 240, 240)' }; }
  };
  const require = createRequire(import.meta.url), originalLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (request === 'electron') return electron;
    if (request === './project-links.json' && parent?.filename === join(root, 'main.cjs')) return links;
    if (request === './wallpaper-client.cjs' && parent?.filename === join(root, 'main.cjs')) return client;
    return originalLoad.call(this, request, parent, ...rest);
  };
  try {
    require('./main.cjs'); await ready;
    assert.equal(quitError, undefined);
    const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
    const call = (name, ...args) => handlers.get(name)(sender, ...args);
    for (const name of ['prism:background-connection', 'prism:background-cancel-start', 'prism:task-manager']) await assert.rejects(handlers.get(name)({ ...sender, senderFrame: {} }), /Invalid sender/);
    await call('prism:wallpaper-start');
    assert.equal(shows,1,'Open Codex must bring the verified existing session back, even without an active background');
    assert.equal(launches,0,'Showing a verified session must not launch a separate wallpaper session');
    await call('prism:background-connection');
    assert.equal(shows,1,'Background polling must not bring a window to the foreground');
    await call('prism:task-manager'); assert.equal(taskManagers,1);
    await assert.rejects(handlers.get('prism:project-link')({ ...sender, senderFrame: {} }, 'github'), /Invalid sender/);
    for (const name of ['github', 'support']) await call('prism:project-link', name);
    assert.deepEqual(opened, [links.github, links.support]);
    for (const name of ['https://example.com', '__proto__', 'settings', null]) await assert.rejects(call('prism:project-link', name), /Unknown project link/);
    for (const value of [null, '', true, 'file:///C:/Windows', 'https://github.com.evil/a/b', "https://github.com/a/b?x=';calc'", 'https://github.com/a/..', 'https://github.com/a/b\n']) {
      links.github = value;
      await assert.rejects(call('prism:project-link', 'github'), /not available yet|Invalid project link/);
    }
    assert.equal(opened.length, 2, 'Rejected inputs must never reach the operating system');
    links.support = 'https://buymeacoffee.com.evil/prism';
    await assert.rejects(call('prism:project-link', 'support'), /Invalid project link/);
    assert.equal(opened.length, 2, 'Unapproved support hosts must never reach the operating system');
    await assert.rejects(handlers.get('prism:image')({ ...sender, senderFrame: {} }, 'chat'), /Invalid sender/);
    for (const area of ['chat','sidebar','right','terminal']) await call('prism:image', area);
    await assert.rejects(call('prism:image', 'outside'), /Invalid image area/);
    const settings = { mode: 'separate', veil: .85, sidebarVeil: .6, rightVeil:.45,terminalVeil:.95,sidebarLinked: true,rightLinked:false,terminalLinked:true,rightEnabled:true,terminalEnabled:false,clearText: true, soften: true };
    const applied = await call('prism:wallpaper-apply', settings);
    assert.equal(applied.saved, true); assert.equal(applied.installed, true);
    assert.equal(applied.connection.appearance, 'rgb(240, 240, 240)', 'Apply must deliver Codex appearance to the preview');
    assert.equal((await call('prism:background-connection')).appearance, applied.connection.appearance, 'background polling must retain Codex appearance');
    assert.equal(applied.history.profiles[0].rightEnabled,true); assert.equal(applied.history.profiles[0].terminalEnabled,false);
    const activeId = applied.history.activeId;
    const saved = await call('prism:background-save', { ...settings, veil: .95 }, 'Quiet');
    assert.equal(saved.activeId, activeId); assert.equal(saved.profiles.length, 2);
    assert.equal(saved.profiles.find(p => p.name === 'Quiet').saved, true);
    assert.equal(saved.profiles[0].id, activeId, 'current setup stays first');
    assert.equal((await call('prism:background-load', activeId)).sidebarVeil, .6);
    assert.equal((await call('prism:background-load', activeId)).sidebarLinked, true);
    assert.equal((await call('prism:background-load', activeId)).rightVeil, .45);
    assert.equal((await call('prism:background-load', activeId)).terminalVeil, .95);
    assert.equal((await call('prism:background-load', activeId)).rightLinked, false);
    assert.equal((await call('prism:background-load', activeId)).terminalLinked, true);
    assert.equal((await call('prism:background-load', activeId)).rightEnabled,true);
    assert.equal((await call('prism:background-load', activeId)).terminalEnabled,false);
    assert.equal((await call('prism:background-load', activeId)).clearText, true);
    assert.equal((await call('prism:background-load', activeId)).soften, true);
    assert.equal((await call('prism:settings')).opened, true); assert.equal(settingsOpens, 1); assert.equal(launches, 0);
    assert.deepEqual(await call('prism:fonts'), ['Arial', 'Consolas']); await call('prism:fonts'); assert.equal(fontReads, 1);
    let prevented = false; window.emit('close', { preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true); assert.equal(window.hidden, true);
    online = false; diagnostic = 'codex-open';
    const cancelled = await call('prism:wallpaper-apply', settings);
    assert.equal(cancelled.cancelled, true); assert.equal(cancelled.saved, true);
    assert.equal(cancelled.connection.autoStart, false); assert.equal(cancelled.connection.saved, true);
    assert.equal(launches, 0);
    dialogResponse = 1;
    const waiting = await call('prism:wallpaper-start');
    assert.equal(waiting.connection.code, 'codex-open'); assert.equal(waiting.connection.autoStart, true);
    assert.equal((await call('prism:background-connection')).autoStart, true);
    assert.equal(launches, 0, 'Never close or restart an ordinary open session');
    diagnostic = 'codex-closed';
    assert.equal((await call('prism:background-connection')).code, 'starting');
    assert.equal((await call('prism:wallpaper-start')).connection.code, 'starting');
    assert.equal(prompts, 2, 'cancel, then one remembered approval'); assert.equal(launches, 1, 'launch at most once');
    online = true; diagnostic = 'ready';
    assert.equal((await call('prism:background-connection')).code, 'applied');
    online = false; diagnostic = 'codex-closed';
    assert.equal((await call('prism:background-connection')).code, 'codex-closed');
    assert.equal(launches, 1, 'A later Codex quit must not reopen it');
    diagnostic = 'codex-open'; await call('prism:wallpaper-start');
    assert.equal((await call('prism:background-cancel-start')).autoStart, false);
    diagnostic = 'codex-closed'; await call('prism:background-connection');
    assert.equal(launches, 1, 'Cancellation disarms opening');
    for (diagnostic of ['unsafe-session', 'port-in-use', 'codex-update', 'codex-missing', 'helper-blocked']) {
      const result = await call('prism:wallpaper-start');
      assert.equal(result.connection.code, diagnostic); assert.equal(result.launched, false);
    }
    assert.equal(prompts, 2); assert.equal(launches, 1, 'Blocked diagnostics never launch');
    diagnostic = 'codex-closed'; launchError = true;
    assert.equal((await call('prism:wallpaper-start')).connection.code, 'apply-error');
    await call('prism:background-connection');
    assert.equal(launches, 2, 'Failed launch must not retry automatically');
    const removed = await call('prism:wallpaper-remove');
    assert.equal(removed.history.activeId, null); assert.equal(removed.waiting, true);
    const disk = JSON.parse(await readFile(join(directory, 'backgrounds', 'backgrounds.json'), 'utf8'));
    assert.equal(disk.pendingRemoval, true); assert.equal(disk.launchApproved, true); assert.equal(disk.profiles.length, 2);
    await assert.rejects(call('prism:background-startup', true), /packaged Prism/);
    for (const veil of [.5, .6, .7, .8, .9]) await call('prism:background-save', { ...settings, veil }, `Saved ${veil}`);
    assert.equal((await call('prism:backgrounds')).profiles.length, 4, 'only four history entries are returned');
    assert.equal(JSON.parse(await readFile(join(directory, 'backgrounds', 'backgrounds.json'), 'utf8')).profiles.length, 7, 'older files are preserved');
  } finally {
    app.emit('before-quit');
    Module._load = originalLoad;
    const absolute = resolve(directory), prefix = join(resolve(tmpdir()), 'prism-desktop-test-');
    assert.ok(absolute.startsWith(prefix) && absolute.length > prefix.length);
    await rm(absolute, { recursive: true });
  }
});
