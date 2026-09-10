const { app, BrowserWindow, ipcMain, clipboard, session, dialog, nativeImage, Tray, Menu, shell } = require('electron');
const fs = require('node:fs/promises');
const wallpaper = require('./wallpaper-client.cjs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
app.setName('Prism');
app.setAppUserModelId('local.prism.codexthemes');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window, tray, quitting = false, timer, openCodex;
  let operations = Promise.resolve();
  function exclusive(task) { const next = operations.then(task); operations = next.catch(() => {}); return next; }
  function showWindow() { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } }
  app.on('second-instance', (_event, argv) => { if (argv.includes('--open-codex') && openCodex) openCodex().then(result => { if (!result.launched) showWindow(); }).catch(() => showWindow()); else showWindow(); });
  app.on('before-quit', () => { quitting = true; clearTimeout(timer); });
  app.whenReady().then(async () => {
    const page = pathToFileURL(path.join(__dirname, 'index.html')).href;
    const { openBackgroundStore } = await import('./background-store.mjs');
    const { backgroundKeeper } = await import('./background-keeper.mjs');
    const { wallpaperOptions } = await import('./wallpaper.mjs');
    let store, storageError = '', connectionStatus = 'Checking Codex…', connection = { code: 'checking', detail: '', autoStart: false, saved: false }, pendingStart = false, openingSince = 0;
    try { store = await openBackgroundStore(path.join(app.getPath('userData'), 'backgrounds')); }
    catch (error) { storageError = error.message; }
    function requireStore() { if (!store) throw new Error(storageError); return store; }
    function report(message) {
      connectionStatus = message;
      if (window && !window.isDestroyed()) window.webContents.send('prism:background-status', { message, connection });
      tray?.setToolTip(`Prism · ${message}`.slice(0, 120));
    }
    function publishConnection(value) {
      connection = { ...value, detail: value.detail || '', autoStart: pendingStart, saved: !!store?.snapshot().activeId };
      report(({ checking: 'Checking Codex…', ready: 'Codex is ready for your background.', applied: 'Your background is showing in Codex.', 'codex-open': 'Quit ChatGPT from its Windows tray icon. Use Still running? for help.', 'codex-closed': 'Open Codex to show your background.', starting: 'Opening Codex…', 'codex-loading': 'Waiting for Codex to finish opening.', partial: 'Some areas are still waiting for Codex.' })[connection.code] || 'Prism needs your attention. See the instructions in Prism.');
      return connection;
    }
    async function advanceOpen(value) {
      if (openingSince) {
        if (Date.now() - openingSince < 45000 && ['codex-closed', 'codex-open'].includes(value.code)) return { code: 'starting' };
        openingSince = 0;
      }
      if (!pendingStart) return value;
      if (!store?.snapshot().launchApproved) { pendingStart = false; return value; }
      if (value.code === 'codex-open') return value;
      pendingStart = false;
      if (value.code !== 'codex-closed') return value;
      try { const result = await wallpaper.windows('Launch'); if (!result.launched) throw new Error('Codex did not confirm that it started. Click Open Codex to try again.'); openingSince = Date.now(); return { code: 'starting' }; }
      catch (error) { return { code: error.code || 'apply-error', detail: error.message }; }
    }
    const keep = store ? backgroundKeeper(store, wallpaper.operate) : null;
    async function restore() {
      if (!store) return { waiting: true, connection: publishConnection({ code: 'storage-error', detail: storageError }) };
      const value = await advanceOpen(await wallpaper.connection());
      if (value.code !== 'ready') return { waiting: true, connection: publishConnection(value) };
      const result = await keep();
      let state = { code: result.installed ? 'applied' : result.partial ? 'partial' : 'ready', detail: result.message || '', appearance: result.appearance };
      if (result.waiting && !result.partial) {
        state = await wallpaper.connection();
        if (state.code === 'ready') state = { code: result.message?.startsWith('Codex is still opening') ? 'codex-loading' : 'apply-error', detail: result.message };
      }
      return { ...result, connection: publishConnection(state) };
    }
    session.defaultSession.setPermissionRequestHandler((_w, _p, done) => done(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    window = new BrowserWindow({ width: 1040, height: 760, minWidth: 800, minHeight: 650,
      title: 'Prism · Your Codex space', backgroundColor: '#FAF9F7', icon: path.join(__dirname, 'icon.ico'), show: !process.argv.includes('--background'),
      autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
    });
    window.removeMenu();
    window.on('close', event => {
      const state = store?.snapshot();
      if (!quitting && (state?.activeId || state?.pendingRemoval || pendingStart || openingSince)) { event.preventDefault(); window.hide(); }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    function checkSender(event) {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== page) throw new Error('Invalid sender.');
    }
    const selectedImages = {};
    function draft(options) {
      if (!options || typeof options !== 'object') throw new Error('Invalid wallpaper settings.');
      const value = { mode: options.mode, veil: options.veil, clearText: options.clearText, soften: options.soften, chatEnabled: options.chatEnabled, sidebarEnabled: options.sidebarEnabled, rightEnabled: options.rightEnabled, terminalEnabled: options.terminalEnabled, image: selectedImages.chat };
      for (const area of ['sidebar','right','terminal']) {
        value[`${area}Image`] = selectedImages[area];
        value[`${area}Veil`] = options[`${area}Veil`];
        value[`${area}Linked`] = options[`${area}Linked`];
      }
      const checked = wallpaperOptions(value);
      for (const area of ['right','terminal']) if (selectedImages[area] === undefined) delete checked[`${area}Image`];
      return checked;
    }
    function selectProfile(profile) { selectedImages.chat = profile.image; for (const area of ['sidebar','right','terminal']) selectedImages[area] = profile[`${area}Image`]; return profile; }
    const startupOptions = { path: process.execPath, args: ['--background'] };
    const thumbnails = new Map();
    async function history() {
      const state = requireStore().snapshot();
      const profiles = [];
      const recent = [...state.profiles.filter(p => p.id === state.activeId), ...state.profiles.filter(p => p.id !== state.activeId)].slice(0, 4);
      const usedThumbnails = new Set();
      for (const p of recent) {
        const key = p.mode === 'separate' ? `${p.image}:${p.sidebarImage}` : p.image;
        usedThumbnails.add(key);
        if (!thumbnails.has(key)) {
          try {
            const value = await store.load(p.id);
            const thumbnail = image => {
              const decoded = nativeImage.createFromDataURL(image), size = decoded.getSize();
              return decoded.resize(size.width / size.height > 100 / 68 ? { width: 100 } : { height: 68 }).toDataURL();
            };
            const chat = thumbnail(value.image);
            thumbnails.set(key, { chat, sidebar: p.image === p.sidebarImage ? chat : thumbnail(value.sidebarImage) });
          } catch { thumbnails.set(key, {}); }
        }
        profiles.push({ id: p.id, name: p.name, saved: p.saved, mode: p.mode, veil: p.veil, sidebarVeil: p.sidebarVeil, rightVeil: p.rightVeil ?? p.sidebarVeil, terminalVeil: p.terminalVeil ?? p.sidebarVeil, chatEnabled: p.chatEnabled ?? p.mode !== 'sidebar', sidebarEnabled: p.sidebarEnabled ?? p.mode !== 'chat', rightEnabled: p.rightEnabled ?? false, terminalEnabled: p.terminalEnabled ?? false, updatedAt: p.updatedAt, thumbnails: thumbnails.get(key) });
      }
      for (const key of thumbnails.keys()) if (!usedThumbnails.has(key)) thumbnails.delete(key);
      return { profiles, activeId: state.activeId, status: connectionStatus, connection, startAtLogin: app.isPackaged && app.getLoginItemSettings(startupOptions).openAtLogin };
    }
    async function startCodex() {
      requireStore();
      const value = await advanceOpen(await wallpaper.connection());
      if (value.code === 'ready') { await wallpaper.windows('Show'); const result = await restore(); return { ...result, launched: ['ready', 'applied', 'codex-loading', 'partial'].includes(result.connection.code), alreadyOpen: true }; }
      if (!['codex-open', 'codex-closed'].includes(value.code)) return { launched: value.code === 'starting', waiting: true, connection: publishConnection(value) };
      if (!store.snapshot().launchApproved) {
        const result = await dialog.showMessageBox(window, { type: 'warning', title: 'Enable Codex backgrounds?', message: 'Let Prism open Codex with backgrounds?', detail: 'Prism will remember this choice. Windows calls this Codex app ChatGPT. Save your work, then choose Quit from its icon near the Windows clock. Closing its windows can leave it running. Keep Prism running: it will open Codex once after you close it, then show your saved background. Prism never closes Codex for you.\n\nThis enables local debugging on 127.0.0.1:9339. Local programs could read or control that session, including conversations. Prism uses a separate profile, which may need sign-in. Quit Codex to close the connection; a normal Codex launch does not enable it.', buttons: ['Cancel', 'Enable backgrounds'], defaultId: 0, cancelId: 0 });
        if (result.response !== 1) { pendingStart = false; return { launched: false, cancelled: true, connection: publishConnection(value) }; }
        await store.approveLaunch();
      }
      pendingStart = true;
      const next = publishConnection(await advanceOpen(value));
      if (next.code === 'codex-open') showWindow();
      return { launched: next.code === 'starting', waiting: true, connection: next };
    }
    openCodex = () => exclusive(startCodex);
    function openAndShow() { return openCodex().then(result => { if (!result.launched) showWindow(); }).catch(error => { publishConnection({ code: 'apply-error', detail: error.message }); showWindow(); }); }
    async function removeBackground() {
      requireStore(); pendingStart = false; await store.remove();
      const result = await restore();
      return { ...result, history: await history() };
    }
    tray = new Tray(path.join(__dirname, 'icon.ico'));
    tray.setToolTip('Prism · Backgrounds');
    tray.on('double-click', showWindow);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Prism', click: showWindow },
      { label: 'Open Codex', click: openAndShow },
      { label: 'Remove backgrounds', click: () => exclusive(removeBackground).catch(error => { report(error.message); showWindow(); }) },
      { type: 'separator' },
      { label: 'Quit Prism (stop automatic restoration)', click: () => app.quit() }
    ]));
    ipcMain.handle('prism:settings', async event => { checkSender(event); return exclusive(() => wallpaper.windows('Settings')); });
    ipcMain.handle('prism:task-manager', async event => { checkSender(event); return exclusive(() => wallpaper.windows('TaskManager')); });
    ipcMain.handle('prism:project-link', async (event, name) => {
      checkSender(event);
      if (!['github', 'support'].includes(name)) throw new Error('Unknown project link.');
      const destination = require('./project-links.json')[name];
      if (!destination) throw new Error(`${name === 'github' ? 'The GitHub' : 'The support'} page is not available yet.`);
      const pattern = name === 'github' ? /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/ : /^https:\/\/buymeacoffee\.com\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
      if (typeof destination !== 'string' || destination.trim() !== destination || !pattern.test(destination)) throw new Error('Invalid project link.');
      await shell.openExternal(destination);
      return true;
    });
    let fonts;
    ipcMain.handle('prism:fonts', async event => {
      checkSender(event);
      if (!fonts) fonts = wallpaper.windows('Fonts').then(result => result.families.filter(name => typeof name === 'string' && name.length <= 100).slice(0, 1000)).catch(error => { fonts = null; throw error; });
      return fonts;
    });
    ipcMain.handle('prism:image', async (event, area = 'chat') => {
      checkSender(event);
      if (!['chat', 'sidebar', 'right', 'terminal'].includes(area)) throw new Error('Invalid image area.');
      return exclusive(async () => {
      const result = await dialog.showOpenDialog(window, { title: 'Choose a background image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
      if (result.canceled) return null;
      const file = result.filePaths[0];
      if ((await fs.stat(file)).size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
      const decoded = nativeImage.createFromBuffer(await fs.readFile(file));
      if (decoded.isEmpty()) throw new Error('This file could not be decoded as an image.');
      const size = decoded.getSize();
      const image = size.width > 2560 || size.height > 2560 ? decoded.resize(size.width >= size.height ? { width: 2560 } : { height: 2560 }) : decoded;
      selectedImages[area] = 'data:image/jpeg;base64,' + image.toJPEG(90).toString('base64');
      return { image: selectedImages[area], name: path.basename(file) };
      });
    });
    ipcMain.handle('prism:backgrounds', async event => {
      checkSender(event);
      if (storageError) return { profiles: [], activeId: null, error: storageError, connection: publishConnection({ code: 'storage-error', detail: storageError }) };
      const result = await history();
      if (result.activeId) {
        try { result.active = selectProfile(await store.load(result.activeId)); }
        catch (error) { result.warning = error.message; }
      }
      return result;
    });
    ipcMain.handle('prism:background-load', async (event, id) => { checkSender(event); return exclusive(async () => selectProfile(await requireStore().load(id))); });
    ipcMain.handle('prism:background-save', async (event, options, name) => {
      checkSender(event);
      if (typeof name !== 'string' || !name.trim()) throw new Error('Give this background a name.');
      return exclusive(async () => { await requireStore().save(draft(options), { name }); return history(); });
    });
    ipcMain.handle('prism:background-startup', async (event, value) => {
      checkSender(event);
      if (!app.isPackaged || typeof value !== 'boolean') throw new Error('Use the packaged Prism app to change Windows startup.');
      app.setLoginItemSettings({ ...startupOptions, openAtLogin: value });
      return app.getLoginItemSettings(startupOptions).openAtLogin;
    });
    ipcMain.handle('prism:wallpaper-start', event => { checkSender(event); return openCodex(); });
    ipcMain.handle('prism:background-connection', async event => { checkSender(event); return exclusive(async () => { await restore(); return connection; }); });
    ipcMain.handle('prism:background-cancel-start', async event => { checkSender(event); return exclusive(async () => { pendingStart = false; await restore(); return connection; }); });
    ipcMain.handle('prism:wallpaper-apply', async (event, options) => {
      checkSender(event);
      return exclusive(async () => { await requireStore().save(draft(options), { activate: true }); const result = await startCodex(); return { ...result, saved: true, history: await history() }; });
    });
    ipcMain.handle('prism:wallpaper-remove', event => { checkSender(event); return exclusive(removeBackground); });
    ipcMain.handle('prism:copy', async (event, text) => { checkSender(event); const { parse } = await import('./theme.mjs'); parse(text); clipboard.writeText(text); return true; });
    await window.loadURL(page);
    async function keepBackground() {
      if (quitting) return;
      await exclusive(restore);
      if (!quitting) timer = setTimeout(keepBackground, pendingStart || openingSince || connection.code === 'codex-loading' ? 2000 : 15000);
    }
    keepBackground().catch(error => report(error.message));
    if (process.argv.includes('--open-codex')) openAndShow();
  }).catch(error => { dialog.showErrorBox('Prism could not start', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
