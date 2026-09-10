import { preset, presets, parse, serialize, normalize, ratio, readLibrary, saveLibrary } from './theme.mjs';
import { wallpaperOptions } from './wallpaper.mjs';
const $ = id => document.getElementById(id);
function cancelConfirmations() {
  for (const button of document.querySelectorAll('[data-confirming]')) {
    button.textContent = button.dataset.confirming;
    delete button.dataset.confirming;
    button.parentElement.querySelector('.cancel-confirm').hidden = true;
  }
}
function confirmed(button) {
  if (button.dataset.confirming) { cancelConfirmations(); return true; }
  cancelConfirmations();
  button.dataset.confirming = button.textContent;
  button.textContent = button.dataset.confirmLabel;
  button.parentElement.querySelector('.cancel-confirm').hidden = false;
  return false;
}
document.addEventListener('click', event => { const button = event.target.closest('.cancel-confirm'); if (button) { const trigger = button.previousElementSibling; cancelConfirmations(); trigger.focus(); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape') cancelConfirmations(); });
document.addEventListener('pointerdown', event => { if (!event.target.closest('.confirm-action')) cancelConfirmations(); });
document.addEventListener('input', cancelConfirmations);
document.addEventListener('focusin', event => { if (!event.target.closest('.confirm-action')) cancelConfirmations(); });
let library = { themes: [], backups: [] }, storageReady = true;
let current = structuredClone(presets.find(p => p.payload.variant === 'light')), baseline = structuredClone(current), selectedId = `preset-${presets.findIndex(p => p.payload.variant === 'light')}`, filter = 'all', themePage = 0;
let copiedText = '', pendingEdits = false;
const backgroundTheme = preset('Codex', '', 'dark', '#0F0F14', '#F0F0F0', '#ADC6DC').payload.theme;
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
for (const name of ['github', 'support']) $(`${name}-open`).addEventListener('click', async () => {
  try {
    if (!window.prism?.openProjectLink) throw new Error('Open the Prism desktop app to use this link.');
    await window.prism.openProjectLink(name);
    status(`${name === 'github' ? 'GitHub' : 'Support page'} opened in your browser.`);
  } catch (error) { status(error.message, true); }
});
try { library = readLibrary(localStorage); }
catch { storageReady = false; status('Your saved library could not be read. Saving is disabled to protect it; import and export still work.', true); }
function commit(next) {
  if (!storageReady) throw new Error('Saving is disabled because the existing library could not be read.');
  saveLibrary(localStorage, next); library = next;
}
function allThemes() { return [...presets.map((p, i) => ({ ...p, id: `preset-${i}` })), ...library.themes]; }
function setThemeView(view) {
  document.querySelector('.theme-controls').dataset.view = view;
  for (const name of ['library', 'editor']) $(`theme-${name}-view`).setAttribute('aria-pressed', String(name === view));
}
function revealSelected(themes = allThemes()) {
  const index = themes.findIndex(theme => theme.id === selectedId);
  if (index >= 0) themePage = Math.floor(index / 6);
}
function drawList() {
  const themes = allThemes().filter(t => (filter === 'all' || (filter === 'saved' ? !t.id.startsWith('preset-') : t.payload.variant === filter)) && t.name.toLowerCase().includes($('search').value.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(themes.length / 6));
  themePage = Math.max(0, Math.min(themePage, pageCount - 1));
  $('theme-count').textContent = String(themes.length).padStart(2, '0');
  $('theme-page-label').textContent = `${themePage + 1} / ${pageCount}`;
  $('theme-page-prev').disabled = themePage === 0;
  $('theme-page-next').disabled = themePage === pageCount - 1;
  $('theme-paging').hidden = themes.length <= 6;
  $('delete-saved').hidden = !library.themes.some(t => t.id === selectedId);
  $('themes').replaceChildren();
  for (const entry of themes.slice(themePage * 6, themePage * 6 + 6)) {
    const button = document.createElement('button'); button.className = 'theme-choice';
    button.setAttribute('aria-pressed', String(entry.id === selectedId)); button.setAttribute('aria-label', `${entry.name}, ${entry.payload.variant} theme`);
    const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.backgroundColor = entry.payload.theme.surface; swatch.setAttribute('aria-hidden', 'true');
    for (const color of [entry.payload.theme.accent, entry.payload.theme.ink, entry.payload.theme.surface]) { const band = document.createElement('i'); band.style.backgroundColor = color; swatch.append(band); }
    const label = document.createElement('span'), name = document.createElement('strong'), subtitle = document.createElement('small');
    name.textContent = entry.name; subtitle.textContent = entry.payload.variant === 'dark' ? 'DARK PALETTE' : 'LIGHT PALETTE'; label.append(name, subtitle);
    button.append(swatch, label);
    if (entry.id === selectedId) { const check = document.createElement('span'); check.className = 'choice-check'; check.textContent = '✓'; button.append(check); }
    button.addEventListener('click', () => {
      if (pendingEdits && !confirm('Discard the unsaved color edits and open this palette?')) return;
      current = structuredClone(entry); baseline = structuredClone(current); selectedId = entry.id; pendingEdits = false;
      syncControls(); drawList(); status(`${entry.name} is previewing. Codex has not changed.`);
    });
    $('themes').append(button);
  }
  if (!themes.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = filter === 'saved' ? 'Saved palettes will appear here.' : 'No palettes match your search.'; $('themes').append(p); }
}
function refreshPreview() {
  const t = document.body.dataset.studio === 'backgrounds' ? backgroundTheme : current.payload.theme, preview = $('preview');
  for (const [key, value] of Object.entries({ surface: t.surface, ink: t.ink, tint: t.accent, added: t.semanticColors.diffAdded, removed: t.semanticColors.diffRemoved, skill: t.semanticColors.skill })) preview.style.setProperty(`--${key}`, value);
  // ponytail: panel tint approximates Codex; use its renderer only if a public preview API becomes available.
  preview.style.setProperty('--panel', `color-mix(in srgb, ${t.surface}, ${t.ink} ${2 + t.contrast / 16}%)`);
  preview.style.fontFamily = t.fonts.ui || '';
  preview.style.setProperty('--outline-color', ratio(t.ink, '#000000') > ratio(t.ink, '#FFFFFF') ? '#000' : '#fff');
  preview.querySelector('.mock-code').style.fontFamily = t.fonts.code || '';
  preview.querySelector('.mock-messages').style.fontFamily = t.fonts.content || '';
  $('theme-title').textContent = current.name;
  if (document.body.dataset.studio === 'themes') $('preview-selection').textContent = current.name;
  $('theme-description').textContent = `${current.payload.variant === 'dark' ? 'Dark' : 'Light'} theme`;
  $('variant-label').textContent = current.payload.variant === 'dark' ? 'Dark' : 'Light';
  $('contrast-value').textContent = current.payload.theme.contrast;
  const contrast = ratio(current.payload.theme.surface, current.payload.theme.ink);
  $('readability').textContent = `${contrast.toFixed(1)}:1 text contrast${contrast < 4.5 ? ' · low readability' : ' · AA text'}`;
  $('readability').classList.toggle('low', contrast < 4.5);
}
function edited() { pendingEdits = true; refreshPreview(); status('Preview updated. Save the theme to keep your edits.'); }
function colorControl(key, name, semantic = false) {
  const wrapper = document.createElement('div'); wrapper.className = 'color-control';
  const label = document.createElement('label'); label.htmlFor = `hex-${key}`; label.textContent = name;
  const field = document.createElement('div'); field.className = 'color-field';
  const picker = document.createElement('input'); picker.type = 'color'; picker.id = `color-${key}`; picker.setAttribute('aria-label', `${name} color picker`);
  const text = document.createElement('input'); text.type = 'text'; text.id = `hex-${key}`; text.maxLength = 7; text.spellcheck = false; text.setAttribute('aria-label', `${name} hex`);
  const update = value => {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) { text.setAttribute('aria-invalid', 'true'); status(`${name} needs six hex digits, for example #AABBCC.`, true); return; }
    text.removeAttribute('aria-invalid');
    (semantic ? current.payload.theme.semanticColors : current.payload.theme)[key] = value.toUpperCase();
    if (key === 'accent') current.payload.theme.accentSource = 'custom';
    picker.value = value; text.value = value.toUpperCase(); edited();
  };
  picker.addEventListener('input', () => update(picker.value)); text.addEventListener('input', () => update(text.value));
  field.append(picker, text); wrapper.append(label, field); return wrapper;
}
for (const [key, label] of [['surface', 'Background'], ['ink', 'Text'], ['accent', 'Accent']]) $('color-controls').append(colorControl(key, label));
for (const [key, label] of [['diffAdded', 'Added code'], ['diffRemoved', 'Removed code'], ['skill', 'Skills']]) $('semantic-controls').append(colorControl(key, label, true));
function syncControls() {
  const t = current.payload.theme;
  for (const key of ['surface', 'ink', 'accent', 'diffAdded', 'diffRemoved', 'skill']) { const value = t[key] || t.semanticColors[key]; $(`color-${key}`).value = value; $(`hex-${key}`).value = value; $(`hex-${key}`).removeAttribute('aria-invalid'); }
  $('contrast').value = t.contrast; $('opaque').checked = t.opaqueWindows;
  for (const key of ['ui', 'content', 'code']) {
    const select = $(`${key}-font`), value = t.fonts[key] || '';
    if (value && !Array.from(select.options).some(option => option.value === value)) select.add(new Option(`${value} (from theme)`, value));
    select.value = value;
  }
  refreshPreview();
}
function validCurrent() {
  if (document.querySelector('[aria-invalid="true"]')) throw new Error('Fix the highlighted hex color before saving or copying.');
  return normalize(current.payload);
}
async function copyText(text) {
  parse(text);
  if (window.prism) await window.prism.copy(text);
  else await navigator.clipboard.writeText(text);
}
async function copyForCodex(text = serialize(validCurrent()), restore = false) {
  const payload = parse(text); await copyText(text); copiedText = text;
  $('copy-message').textContent = restore ? 'Original colors and fonts copied. Follow the steps to restore them.' : `${current.name} copied. Follow the steps to import it.`;
  $('copy-variant').textContent = `${payload.variant === 'dark' ? 'Dark' : 'Light'} theme`;
  $('copy-appearance').textContent = payload.variant === 'dark' ? 'Dark' : 'Light';
  $('copy-dialog').showModal(); status('Theme copied. Import it in Codex.');
}
$('contrast').addEventListener('input', () => { current.payload.theme.contrast = Number($('contrast').value); edited(); });
$('opaque').addEventListener('change', () => { current.payload.theme.opaqueWindows = $('opaque').checked; edited(); status('Opacity preference updated for export. The illustration cannot reproduce Windows translucency.'); });
for (const key of ['ui', 'content', 'code']) $(`${key}-font`).addEventListener('change', () => { current.payload.theme.fonts[key] = $(`${key}-font`).value || null; delete current.payload.theme.fonts[`${key}Face`]; edited(); });
function populateFonts(families) {
  for (const key of ['ui', 'content', 'code']) {
    const select = $(`${key}-font`);
    select.replaceChildren(new Option('System default', ''));
    for (const family of families) select.add(new Option(family, family));
  }
  syncControls();
}
if (window.prism?.fonts) window.prism.fonts().then(populateFonts).catch(() => { $('font-note').textContent = 'Installed fonts could not be listed. System default and fonts from your theme are still available.'; });
else populateFonts(['Arial', 'Consolas', 'Courier New', 'Georgia', 'Segoe UI', 'Times New Roman']);
$('reset').addEventListener('click', () => { current = structuredClone(baseline); pendingEdits = false; syncControls(); status('Edits reset to this palette’s starting colors.'); });
$('search').addEventListener('input', () => { themePage = 0; drawList(); });
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => { filter = button.dataset.filter; themePage = 0; for (const b of document.querySelectorAll('[data-filter]')) b.setAttribute('aria-pressed', String(b === button)); drawList(); });
for (const view of ['library', 'editor']) $(`theme-${view}-view`).addEventListener('click', () => setThemeView(view));
$('theme-page-prev').addEventListener('click', () => { themePage--; drawList(); });
$('theme-page-next').addEventListener('click', () => { themePage++; drawList(); });
for (const button of document.querySelectorAll('[data-open]')) button.addEventListener('click', () => { cancelConfirmations(); const dialog = $(button.dataset.open); if (!dialog.open) dialog.showModal(); });
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => $(button.dataset.close).close());
$('import-open').addEventListener('click', () => { $('import-error').textContent = ''; $('import-dialog').showModal(); });
$('import-file').addEventListener('change', async () => {
  try { const file = $('import-file').files[0]; if (!file) return; if (file.size > 32768) throw new Error('Choose a theme text file smaller than 32 KB.'); $('import-text').value = await file.text(); $('import-error').textContent = ''; }
  catch (error) { $('import-error').textContent = error.message; }
});
$('import-submit').addEventListener('click', () => {
  try {
    const payload = parse($('import-text').value);
    if (pendingEdits && !confirm('Discard unsaved edits and preview the imported theme?')) return;
    current = { name: 'Imported palette', description: 'Imported from a Codex theme', payload }; baseline = structuredClone(current); selectedId = ''; pendingEdits = false;
    themePage = 0; syncControls(); drawList(); setThemeView('editor'); $('import-dialog').close(); status('Theme imported. Save it to add it to your library.');
  } catch (error) { $('import-error').textContent = error.message; }
});
$('save-open').addEventListener('click', () => { try { validCurrent(); $('save-name').value = current.name; $('save-error').textContent = ''; $('save-dialog').showModal(); } catch (error) { status(error.message, true); } });
$('save-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const name = $('save-name').value.trim(); if (!name) throw new Error('Give your palette a name.');
    const entry = { id: crypto.randomUUID(), name, description: 'Saved theme', payload: validCurrent() };
    commit({ ...library, themes: [...library.themes, entry] }); current = structuredClone(entry); baseline = structuredClone(entry); selectedId = entry.id; pendingEdits = false;
    filter = 'all'; for (const b of document.querySelectorAll('[data-filter]')) b.setAttribute('aria-pressed', String(b.dataset.filter === 'all'));
    $('search').value = ''; revealSelected(); syncControls(); drawList(); setThemeView('library'); $('save-dialog').close(); status(`${name} saved on this device.`);
  } catch (error) { $('save-error').textContent = error.message; }
});
$('delete-saved').addEventListener('click', () => {
  if (!confirmed($('delete-saved'))) return;
  try {
    commit({ ...library, themes: library.themes.filter(t => t.id !== selectedId) });
    current = structuredClone(presets[0]); baseline = structuredClone(current); selectedId = 'preset-0'; pendingEdits = false; revealSelected();
    syncControls(); drawList(); status('Saved palette deleted from Prism. Codex has not changed.');
  } catch (error) { status(error.message, true); }
});
$('copy').addEventListener('click', async () => { try { await copyForCodex(); } catch (error) { status(`Could not copy: ${error.message}`, true); } });
let tutorialTimer;
function stopTutorial() {
  clearTimeout(tutorialTimer); tutorialTimer = null;
  $('copy-tutorial').src = 'assets/copy-import-poster.png';
  $('play-tutorial').textContent = 'Play instructions';
  $('play-tutorial').setAttribute('aria-pressed', 'false');
}
$('play-tutorial').addEventListener('click', () => {
  if (tutorialTimer) return stopTutorial();
  $('copy-tutorial').src = 'assets/copy-import.gif';
  $('play-tutorial').textContent = 'Stop instructions';
  $('play-tutorial').setAttribute('aria-pressed', 'true');
  tutorialTimer = setTimeout(stopTutorial, 20000);
});
$('copy-dialog').addEventListener('close', stopTutorial);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopTutorial(); });
$('open-settings').hidden = !window.prism;
$('open-settings').addEventListener('click', async () => {
  const button = $('open-settings'); button.disabled = true;
  try { await window.prism.openSettings(); $('copy-message').textContent = 'Settings opened in your current Codex session. Choose Appearance, then continue with step 2. Use Copy again if you have copied something else.'; }
  catch { $('copy-message').textContent = 'In your current Codex window, press Ctrl+, and choose Appearance. Use Copy again if needed. To use the Settings button, open Codex through Prism first.'; }
  finally { button.disabled = false; }
});
$('copy-again').addEventListener('click', async () => {
  const button = $('copy-again'); button.disabled = true;
  try { if (window.prism) await window.prism.copy(copiedText); else await navigator.clipboard.writeText(copiedText); $('copy-message').textContent = 'Theme copied again. Switch to the Codex theme text box and press Ctrl+V.'; }
  catch (error) { $('copy-message').textContent = `Copy failed: ${error.message}`; }
  finally { button.disabled = false; }
});
$('export-file').addEventListener('click', async () => {
  if (window.prism?.saveThemeFile) {
    try { await window.prism.saveThemeFile(copiedText); }
    catch (error) { $('copy-message').textContent = `The theme file could not be saved: ${error.message}`; }
    return;
  }
  const blob = new Blob([copiedText], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `prism-${parse(copiedText).variant}.codex-theme`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function drawBackups() {
  $('backups').replaceChildren();
  for (const entry of [...library.backups].reverse()) {
    const row = document.createElement('div'); row.className = 'backup-row'; const name = document.createElement('span'); name.textContent = entry.name;
    const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = 'Copy to restore';
    restore.addEventListener('click', async () => { try { await copyForCodex(entry.text || serialize(entry.payload), true); $('backup-dialog').close(); } catch (error) { $('backup-error').textContent = error.message; } });
    const action = document.createElement('span'); action.className = 'confirm-action';
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.dataset.confirmLabel = 'Confirm delete';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'cancel-confirm'; cancel.textContent = 'Cancel'; cancel.hidden = true;
    remove.addEventListener('click', () => {
      if (!confirmed(remove)) return;
      try { commit({ ...library, backups: library.backups.filter(b => b.id !== entry.id) }); drawBackups(); }
      catch (error) { $('backup-error').textContent = error.message; }
    });
    action.append(remove, cancel); row.append(name, restore, action); $('backups').append(row);
  }
}
$('backup-open').addEventListener('click', () => { drawBackups(); $('backup-error').textContent = ''; $('backup-dialog').showModal(); });
$('backup-save').addEventListener('click', () => {
  try {
    const text = $('backup-text').value.trim(), payload = parse(text);
    const entry = { id: crypto.randomUUID(), name: `${payload.variant === 'dark' ? 'Dark' : 'Light'} original · ${new Date().toLocaleString()}`.slice(0, 60), payload, text };
    commit({ ...library, backups: [...library.backups, entry] }); $('backup-text').value = ''; $('backup-error').textContent = ''; drawBackups(); status('Original theme backed up on this device.');
  } catch (error) { $('backup-error').textContent = error.message; }
});
window.addEventListener('beforeunload', event => { if (pendingEdits) { event.preventDefault(); event.returnValue = ''; } });
const requestQuit = () => {
  if (confirm(pendingEdits ? 'Are you sure you want to quit Prism? Your unsaved color edits will be lost.' : 'Are you sure you want to quit Prism?')) window.prism.quit();
};
window.prism?.onQuitRequested?.(requestQuit);
$('quit-prism').hidden = !window.prism?.quit;
$('quit-prism').addEventListener('click', requestQuit);
syncControls(); drawList();
let wallpaperImage = '', sidebarImage = '', rightImage = '', terminalImage = '', choosingArea = 'chat', backgroundStorageReady = !window.prism, wallpaperBusy = '', wallpaperApplied = false, draftVersion = 0, pendingApplyVersion = null, connectionDetail = '', backgroundFailure = false, startupWarning = '', cancellingStart = false, backgroundRevision = -1, connectionRevision = -1;
const previewImages = {}, previewUrls = {};
let sidebarLinked = true, rightLinked = true, terminalLinked = true, rightEnabled = false, terminalEnabled = false;
for (const section of ['themes', 'backgrounds']) $(`show-${section}`).addEventListener('click', () => {
  cancelConfirmations();
  document.body.dataset.studio = section;
  for (const name of ['themes', 'backgrounds']) $(`show-${name}`).setAttribute('aria-pressed', String(name === section));
  refreshPreview();
  previewWallpaper();
});
$('show-labels').addEventListener('click', () => {
  const visible = $('show-labels').getAttribute('aria-pressed') !== 'true';
  $('show-labels').setAttribute('aria-pressed', String(visible)); $('preview').dataset.labels = String(visible);
});
function backgroundSettings() { return { mode: document.querySelector('input[name=layout]:checked').value, veil: Number($('wallpaper-veil').value) / 100, sidebarVeil: Number($('sidebar-veil').value) / 100, rightVeil: Number($('right-veil').value) / 100, terminalVeil: Number($('terminal-veil').value) / 100, sidebarLinked, rightLinked, terminalLinked, chatEnabled: $('chat-enabled').checked, sidebarEnabled: $('sidebar-enabled').checked, rightEnabled, terminalEnabled, clearText: $('clear-text').checked, soften: false }; }
function wallpaperStatus(message, error = false) { $('wallpaper-status').textContent = String(message || 'The background operation failed. Please try again.').replace(/^Error invoking remote method '[^']+': Error: /, '') + (startupWarning ? ` ${startupWarning}` : ''); $('wallpaper-status').classList.toggle('error', error); $('wallpaper-status').classList.toggle('success', wallpaperApplied && !error); }
const connectionErrors = {
  'codex-missing':['Install Codex to use backgrounds','Install the official Codex app, then check again.'],
  'codex-update':['Prism cannot connect to this Codex version','Update Prism for compatibility, then check again.'],
  'unsafe-install':['Prism cannot safely connect','This Codex installation could not be verified. Check the installation, then try again.'],
  'unsafe-session':['Prism cannot safely connect','This Codex session could not be verified. Close it yourself, reopen Codex through Prism, then check again.'],
  'port-in-use':['Prism cannot safely connect','Another app is using the required connection. Close that app yourself, then check again.'],
  'helper-missing':['Prism files are incomplete','Extract all Prism files into one folder, reopen Prism, then check again.'],
  'helper-mismatch':['Prism files do not match','Extract all Prism files into one folder, reopen Prism, then check again.'],
  'helper-unavailable':['Prism could not start its background helper','Reopen Prism, then check again.'],
  'helper-blocked':['Windows blocked the background helper','Check Windows Security for what was blocked, then reopen Prism.'],
  'helper-timeout':['The background helper did not respond','Reopen Prism, then check again.'],
  'storage-error':['Prism could not load saved backgrounds','Reopen Prism and check again.'],
  'apply-error':['The background could not be applied','Check again, then Apply once Codex is ready.'],
  'operation-error':['Prism could not finish that step','Your preview is kept. Open Details to see what happened, then try again.']
};
function acceptBackgroundUpdate(update, connection = false) {
  const revision = update?.stateRevision ?? update?.history?.stateRevision ?? update?.connection?.stateRevision;
  if (!Number.isSafeInteger(revision) || revision < 0) return true; // The legacy Electron host has no revisions.
  if (revision < (connection ? connectionRevision : backgroundRevision)) return false;
  if (connection) connectionRevision = revision; else backgroundRevision = revision;
  return true;
}
function renderConnection(connection) {
  if (!connection || !acceptBackgroundUpdate(connection, true)) return;
  if (typeof connection === 'string') { $('background-connection').textContent = connection; return; }
  const rgb = typeof connection.appearance === 'string' && connection.appearance.match(/^rgb\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\s*\)$/)?.slice(1).map(Number);
  if (rgb && rgb.every(value => value <= 255)) {
    const ink = '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    if (ink !== backgroundTheme.ink) {
      backgroundTheme.ink = ink;
      // Match the fade tint used by the wallpaper adapter in Codex.
      backgroundTheme.surface = rgb.reduce((sum, value) => sum + value, 0) / 3 > 128 ? '#0F0F14' : '#F6F6F8';
      refreshPreview();
    }
  }
  const { code = 'unknown', detail = '', autoStart = false, saved = false, backgroundOnly = false } = connection;
  $('wallpaper-start').dataset.attention = String(code === 'codex-closed');
  connectionDetail = detail;
  const panel = $('connection-panel'), title = $('connection-title'), description = $('connection-description');
  const primary = $('connection-primary'), cancel = $('connection-cancel'), check = $('connection-check'), details = $('connection-details');
  let heading, body, state = 'ready', primaryText = '', canCheck = false;
  if (code === 'checking') { heading = 'Checking Codex connection…'; body = 'Prism is checking whether backgrounds are ready.'; state = 'checking'; }
  else if (code === 'ready') { heading = 'Ready to apply'; body = 'Choose an image, then Apply.'; }
  else if (code === 'removing') { heading = 'Automatic restoration is off'; body = 'Prism will remove the background when Codex is reachable. Your history and preview are kept.'; state = 'waiting'; }
  else if (code === 'applied') { heading = 'Background applied'; body = wallpaperApplied ? 'Your saved background is applied in Codex.' : 'Your saved background is applied. Click Apply to use this preview.'; state = 'applied'; }
  else if (code === 'codex-open' && autoStart) { heading = backgroundOnly ? 'ChatGPT is still running in the background' : 'Quit ChatGPT to finish setup'; body = '<ol><li>Save your work. Windows calls this Codex app ChatGPT.</li><li>Right-click its icon near the Windows clock → Quit. Closing the window is not enough.</li></ol><span>Keep Prism running. It will reopen Codex' + (saved ? ' and apply your saved background' : '') + ' automatically. If it still waits, click Still running?</span>'; state = 'waiting'; canCheck = true; }
  else if (code === 'codex-open') { heading = 'Open Codex through Prism'; body = 'Choose an image and click Apply. Prism will guide you through one safe restart. It will never close Codex for you.'; state = 'waiting'; primaryText = 'Connect Codex'; }
  else if (code === 'codex-closed') { heading = saved ? 'Codex is closed' : 'Choose a background'; body = saved ? 'Click Open Codex. Your saved background will appear automatically.' : 'Choose an image and click Apply, or open Codex now.'; primaryText = 'Open Codex'; }
  else if (code === 'starting') { heading = 'Opening Codex…'; body = 'Keep Prism running while Codex opens.' + (saved ? ' Your saved background will apply automatically.' : ' Then choose an image and click Apply.'); state = 'waiting'; canCheck = true; }
  else if (code === 'codex-loading') { heading = 'Finish opening Codex'; body = 'Wait for Codex to load. Sign in or open a task if asked; your saved background will apply automatically.'; state = 'waiting'; canCheck = true; }
  else if (code === 'partial') { heading = 'Codex is still loading'; body = 'Open a task if asked, then check again. Your saved background will apply automatically.'; state = 'waiting'; canCheck = true; }
  else { [heading, body] = connectionErrors[code] || ['Prism could not connect', 'Check the connection again. If this keeps happening, open Details for more information.']; state = 'error'; canCheck = true; }
  panel.dataset.state = state; title.textContent = heading; description.replaceChildren();
  if (body.startsWith('<ol>')) { const template = document.createElement('template'); template.innerHTML = body; description.append(template.content); } else description.textContent = body;
  primary.hidden = !primaryText; primary.textContent = primaryText || 'Open Codex';
  cancel.hidden = !(code === 'codex-open' && autoStart); check.hidden = !canCheck; details.hidden = !detail;
  $('connection-recovery').hidden = code !== 'codex-open';
  const processIds = [...new Set(Array.isArray(connection.processIds) ? connection.processIds.filter(id => Number.isSafeInteger(id) && id > 0).slice(0,50) : [])];
  const mainIds = Array.isArray(connection.mainProcessIds) ? connection.mainProcessIds.filter(id => processIds.includes(id)) : [];
  $('recovery-processes').textContent = processIds.length ? `${mainIds.length ? 'Main ChatGPT.exe PID: ' + mainIds.join(', ') + '. ' : ''}Detected ChatGPT.exe PIDs: ${processIds.join(', ')}.` : code === 'codex-open' ? 'Click Check now to get the current process IDs. Do not end an unrelated ChatGPT app.' : 'There are no process IDs to act on. Close these instructions and follow the updated connection message.';
  $('recovery-next').textContent = autoStart ? 'Prism will reopen Codex automatically after these processes exit. No system restart is needed.' : 'After quitting ChatGPT, close these instructions and click Open Codex in Prism.';
  $('background-connection').textContent = '';
}
async function runBackgroundOperation(action, work, failed = error => wallpaperStatus(error.message, true)) {
  if (wallpaperBusy) return;
  cancelConfirmations();
  wallpaperBusy = action; backgroundFailure = false;
  try { previewWallpaper(); await work(); }
  catch (error) { backgroundFailure = true; failed(error); renderConnection({ code:'operation-error', detail:error.message }); }
  finally { wallpaperBusy = ''; previewWallpaper(); }
}
function previewWallpaper() {
  if (sidebarLinked) $('sidebar-veil').value = Math.min(100, Number($('wallpaper-veil').value) + 10);
  if (rightLinked) $('right-veil').value = Math.min(100, Number($('wallpaper-veil').value) + 10);
  if (terminalLinked) $('terminal-veil').value = Math.min(100, Number($('wallpaper-veil').value) + 10);
  const { mode, veil, sidebarVeil, rightVeil, terminalVeil, chatEnabled, sidebarEnabled } = backgroundSettings(), preview = $('preview');
  const showRight = rightEnabled, showTerminal = terminalEnabled, isBackground = document.body.dataset.studio === 'backgrounds';
  const selected = [['sidebar', sidebarEnabled, 'Left sidebar'], ['chat', chatEnabled, 'Chat'], ['right', showRight, 'Right panel'], ['terminal', showTerminal, 'Terminal']];
  for (const [area, enabled] of selected) preview.querySelector(`[data-area="${area}"]`).dataset.selected = String(enabled && isBackground);
  $('preview-selection').textContent = isBackground ? selected.filter(([, enabled]) => enabled).map(([, , label]) => label).join(' · ') || 'No panes selected' : current.name;
  $('preview-instructions').textContent = isBackground ? 'Apply to use this background in Codex.' : 'Copy, then import the theme in Codex.';
  preview.dataset.outline = String($('clear-text').checked && isBackground);
  preview.dataset.rightEnabled = String(showRight); preview.dataset.terminalEnabled = String(showTerminal);
  $('veil-value').textContent = `${Math.round(veil * 100)}%`;
  $('sidebar-veil-value').textContent = `${Math.round(sidebarVeil * 100)}%`;
  $('right-veil-value').textContent = `${Math.round(rightVeil * 100)}%`;
  $('terminal-veil-value').textContent = `${Math.round(terminalVeil * 100)}%`;
  $('choose-sidebar-image').hidden = mode !== 'separate';
  $('choose-right-image').hidden = mode !== 'separate' || !rightEnabled;
  $('choose-terminal-image').hidden = mode !== 'separate' || !terminalEnabled;
  $('image-label').textContent = mode === 'separate' ? 'Chat image' : 'Background image';
  $('chat-fade').hidden = !chatEnabled;
  $('sidebar-fade').hidden = !sidebarEnabled; $('right-fade').hidden = !showRight; $('terminal-fade').hidden = !showTerminal;
  const anySelected = selected.some(([, enabled]) => enabled);
  const missingImage = mode === 'separate' ? (chatEnabled && !wallpaperImage ? 'chat' : sidebarEnabled && !sidebarImage ? 'panel' : showRight && !(rightImage || sidebarImage) ? 'right panel or shared panel' : showTerminal && !(terminalImage || sidebarImage) ? 'terminal or shared panel' : '') : !wallpaperImage ? 'background' : '';
  $('image-guidance').textContent = !anySelected ? 'Select at least one pane to apply a background.' : missingImage ? `Choose the ${missingImage} image to continue.` : '';
  for (const [id, image, variable] of [['image-thumbnail', wallpaperImage, '--chat-image'], ['sidebar-image-thumbnail', sidebarImage, '--sidebar-image'], ['right-image-thumbnail', rightImage, '--right-image'], ['terminal-image-thumbnail', terminalImage, '--terminal-image']]) {
    if (previewImages[id] === image) continue;
    previewImages[id] = image;
    $(id).hidden = !image; if (image) $(id).src = image; else $(id).removeAttribute('src');
    if (previewUrls[id]) URL.revokeObjectURL(previewUrls[id]);
    // WebView2 rejects large data URLs in custom properties; blob URLs stay short.
    previewUrls[id] = image ? URL.createObjectURL(new Blob([Uint8Array.from(atob(image.split(',')[1]), c => c.charCodeAt(0))], { type: image.slice(5, image.indexOf(';')) })) : '';
    preview.style.setProperty(variable, image ? `url("${previewUrls[id]}")` : 'none');
  }
  for (const id of ['wallpaper-veil','sidebar-veil','right-veil','terminal-veil']) {
    $(id).style.setProperty('--fill', `${(Number($(id).value) - 25) / 75 * 100}%`);
    $(id).setAttribute('aria-valuetext', `${$(id).value}% fading`);
  }
  $('wallpaper-veil').disabled = !!wallpaperBusy || !backgroundStorageReady || !chatEnabled;
  $('sidebar-veil').disabled = !!wallpaperBusy || !backgroundStorageReady || !sidebarEnabled;
  $('right-veil').disabled = !!wallpaperBusy || !backgroundStorageReady || !showRight;
  $('terminal-veil').disabled = !!wallpaperBusy || !backgroundStorageReady || !showTerminal;
  $('reset-fading').disabled = !!wallpaperBusy || !backgroundStorageReady;
  preview.classList.remove('has-wallpaper');
  const bg = (variable, opacity) => `linear-gradient(color-mix(in srgb,var(--surface) ${opacity * 100}%,transparent),color-mix(in srgb,var(--surface) ${opacity * 100}%,transparent)),var(${variable}) center/cover no-repeat`;
  preview.style.background = mode === 'span' && wallpaperImage && isBackground ? 'var(--chat-image) center/cover no-repeat' : '';
  const pane = (selector, variable, opacity, enabled) => { preview.querySelector(selector).style.background = enabled ? (mode === 'span' && wallpaperImage ? `color-mix(in srgb,var(--surface) ${opacity * 100}%,transparent)` : bg(variable, opacity)) : ''; };
  pane('.mock-chat', '--chat-image', veil, isBackground && chatEnabled && !!wallpaperImage);
  pane('.mock-sidebar', mode === 'separate' ? '--sidebar-image' : '--chat-image', sidebarVeil, isBackground && sidebarEnabled && !!(mode === 'separate' ? sidebarImage : wallpaperImage));
  pane('.mock-panel', mode === 'separate' ? rightImage ? '--right-image' : '--sidebar-image' : '--chat-image', rightVeil, isBackground && showRight && !!(mode === 'separate' ? rightImage || sidebarImage : wallpaperImage));
  pane('.mock-terminal', mode === 'separate' ? terminalImage ? '--terminal-image' : '--sidebar-image' : '--chat-image', terminalVeil, isBackground && showTerminal && !!(mode === 'separate' ? terminalImage || sidebarImage : wallpaperImage));
  $('wallpaper-apply').disabled = $('wallpaper-save').disabled = !!wallpaperBusy || !window.prism || !backgroundStorageReady || !anySelected || !!missingImage;
  $('background-save-form').querySelector('[type=submit]').disabled = $('wallpaper-save').disabled;
  for (const id of ['choose-image', 'choose-sidebar-image', 'choose-right-image', 'choose-terminal-image']) $(id).disabled = !!wallpaperBusy || !backgroundStorageReady;
  for (const input of document.querySelectorAll('input[name=layout],#clear-text')) input.disabled = !!wallpaperBusy || !backgroundStorageReady;
  for (const id of ['chat-enabled', 'sidebar-enabled', 'right-enabled', 'terminal-enabled']) $(id).disabled = !!wallpaperBusy || !backgroundStorageReady;
  for (const id of ['wallpaper-start', 'wallpaper-remove']) $(id).disabled = !!wallpaperBusy || !window.prism || !backgroundStorageReady;
  for (const id of ['connection-primary','connection-check','connection-recovery','recovery-check','open-task-manager']) $(id).disabled = !!wallpaperBusy || !window.prism;
  $('connection-cancel').disabled = cancellingStart || !window.prism;
  for (const button of document.querySelectorAll('.history-choice')) button.disabled = !!wallpaperBusy;
  $('wallpaper-apply').setAttribute('aria-busy', String(wallpaperBusy === 'apply'));
  $('wallpaper-apply').textContent = wallpaperBusy === 'apply' ? 'Applying…' : wallpaperApplied ? 'Applied ✓' : 'Apply';
  $('wallpaper-apply').dataset.result = wallpaperApplied ? 'applied' : '';
}
function chooseWallpaper(result, area = choosingArea) {
  if (!result) return;
  wallpaperApplied = false; pendingApplyVersion = null; draftVersion++;
  const image = wallpaperOptions({ image: result.image, veil: .85 }).image;
  if (area === 'sidebar') sidebarImage = image;
  else if (area === 'right') rightImage = image;
  else if (area === 'terminal') terminalImage = image;
  else wallpaperImage = image;
  $({ chat:'image-name', sidebar:'sidebar-image-name', right:'right-image-name', terminal:'terminal-image-name' }[area]).textContent = result.name;
  $('wallpaper-apply').disabled = !window.prism;
  previewWallpaper(); wallpaperStatus($('image-guidance').textContent);
}
for (const [id, area] of [['choose-image','chat'], ['choose-sidebar-image','sidebar'], ['choose-right-image','right'], ['choose-terminal-image','terminal']]) $(id).addEventListener('click', () => {
  if (window.prism) return runBackgroundOperation('choose', async () => chooseWallpaper(await window.prism.chooseImage(area), area));
  choosingArea = area;
  $('browser-image').value = ''; $('browser-image').click();
});
$('browser-image').addEventListener('change', async () => {
  try {
    const file = $('browser-image').files[0]; if (!file) return;
    if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
    const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error || new Error('The image could not be read. Choose it again.')); reader.readAsDataURL(file); });
    chooseWallpaper({ image, name: file.name });
    wallpaperStatus('Open the desktop app to apply this background to Codex.');
  } catch (error) { wallpaperStatus(error.message, true); }
});
for (const id of ['wallpaper-veil','sidebar-veil','right-veil','terminal-veil','wallpaper-layout','clear-text','chat-enabled','sidebar-enabled','right-enabled','terminal-enabled']) $(id).addEventListener('input', () => {
  if (id === 'sidebar-veil') sidebarLinked = false;
  if (id === 'right-veil') rightLinked = false;
  if (id === 'terminal-veil') terminalLinked = false;
  if (id === 'right-enabled') rightEnabled = $('right-enabled').checked;
  if (id === 'terminal-enabled') terminalEnabled = $('terminal-enabled').checked;
  wallpaperApplied = false; pendingApplyVersion = null; draftVersion++; previewWallpaper(); wallpaperStatus('Preview updated. Apply saves and activates this setup.');
});
$('reset-fading').addEventListener('click', () => {
  if (wallpaperBusy || !backgroundStorageReady) return;
  sidebarLinked = rightLinked = terminalLinked = true;
  $('wallpaper-veil').value = '75';
  wallpaperApplied = false; pendingApplyVersion = null; draftVersion++; previewWallpaper(); wallpaperStatus('Default fading restored. Apply to save.');
});
for (const action of ['start', 'apply', 'remove']) {
  const button = $(`wallpaper-${action}`); button.disabled = !window.prism || action === 'apply';
  button.addEventListener('click', () => {
    if (wallpaperBusy) return;
    if (action === 'remove' && !confirmed(button)) return;
    wallpaperApplied = false;
    if (action === 'apply') pendingApplyVersion = null;
    return runBackgroundOperation(action, async () => {
      wallpaperStatus(action === 'apply' ? 'Applying background…' : action === 'start' ? 'Opening Codex…' : 'Removing background…');
      if (action === 'start') { const result = await window.prism.startWallpaper(); if (!acceptBackgroundUpdate(result, true)) return; renderConnection(result.connection); wallpaperStatus(result.cancelled ? 'Opening Codex was cancelled.' : result.launched ? 'Codex is ready or starting. Your saved background will restore automatically.' : 'Follow the setup step above.'); }
      if (action === 'apply') { const version = draftVersion, result = await window.prism.applyWallpaper(backgroundSettings()); if (!acceptBackgroundUpdate(result)) return; if (!result?.saved) throw new Error('The background could not be saved.'); renderBackgroundHistory(result.history); pendingApplyVersion = result.installed ? null : version; wallpaperApplied = !!result.installed && version === draftVersion; renderConnection(result.connection); wallpaperStatus(result.installed ? 'Background applied and saved.' : 'Background saved. Finish the setup step above to apply it.'); }
      if (action === 'remove') { const result = await window.prism.removeWallpaper(); if (!acceptBackgroundUpdate(result)) return; pendingApplyVersion = null; renderBackgroundHistory(result.history); renderConnection(result.connection); wallpaperStatus(result.removed ? 'Background removed. Automatic restoration is off; your history is kept.' : 'Automatic restoration is off. The background will be removed when Codex reconnects.'); }
    });
  });
}
if (!window.prism) wallpaperStatus('Open the Prism desktop app to apply backgrounds.');

previewWallpaper();
const fadeValue = (value, fallback) => Number.isFinite(value) ? value : fallback;
function loadBackgroundPreview(profile) {
  wallpaperApplied = false; pendingApplyVersion = null; draftVersion++;
  sidebarLinked = profile.sidebarLinked ?? false;
  rightLinked = profile.rightLinked ?? sidebarLinked;
  terminalLinked = profile.terminalLinked ?? sidebarLinked;
  wallpaperImage = profile.image || ''; sidebarImage = profile.sidebarImage || '';
  rightImage = profile.rightImage ?? ''; terminalImage = profile.terminalImage ?? '';
  rightEnabled = profile.rightEnabled ?? false; terminalEnabled = profile.terminalEnabled ?? false;
  // Legacy single-area layouts used mode for selection as well as image fitting.
  $('chat-enabled').checked = profile.chatEnabled ?? profile.mode !== 'sidebar';
  $('sidebar-enabled').checked = profile.sidebarEnabled ?? profile.mode !== 'chat';
  if (profile.mode === 'chat') rightEnabled = terminalEnabled = false;
  $('right-enabled').checked = rightEnabled; $('terminal-enabled').checked = terminalEnabled;
  document.querySelector(`input[name=layout][value="${['chat', 'sidebar'].includes(profile.mode) ? 'duplicate' : profile.mode}"]`).checked = true;
  $('clear-text').checked = profile.clearText ?? false;
  const veil = fadeValue(profile.veil, .75), sidebarVeil = fadeValue(profile.sidebarVeil, Math.min(1, veil + .10));
  $('wallpaper-veil').value = Math.round(veil * 100);
  $('sidebar-veil').value = Math.round(sidebarVeil * 100);
  $('right-veil').value = Math.round(fadeValue(profile.rightVeil, sidebarVeil) * 100);
  $('terminal-veil').value = Math.round(fadeValue(profile.terminalVeil, sidebarVeil) * 100);
  $('image-name').textContent = 'Saved image'; $('sidebar-image-name').textContent = 'Saved left sidebar image';
  $('right-image-name').textContent = rightImage ? 'Saved right panel image' : 'Uses left sidebar image unless chosen';
  $('terminal-image-name').textContent = terminalImage ? 'Saved terminal image' : 'Uses left sidebar image unless chosen';
  previewWallpaper();
}
function renderBackgroundHistory(data) {
  if (!data || !acceptBackgroundUpdate(data)) return;
  if ('startupWarning' in data) startupWarning = data.startupWarning || '';
  if ('startAtLogin' in data) { $('background-startup').checked = data.startAtLogin === true; $('background-startup').indeterminate = data.startAtLogin === null; $('background-startup').title = startupWarning; }
  const list = $('background-history-list'); list.replaceChildren();
  const labels = { span:'Spanning', duplicate:'Duplicated', separate:'Separate images', chat:'Chat only', sidebar:'Panels only' };
  for (const profile of data.profiles.slice(0, 4)) {
    const button = document.createElement('button'); button.className = 'history-choice';
    button.setAttribute('aria-label', `Preview ${profile.name}, ${labels[profile.mode]}, ${new Date(profile.updatedAt).toLocaleString()}`);
    const images = document.createElement('span'); images.className = 'history-images';
    for (const area of profile.mode === 'separate' ? ['sidebar','chat'] : ['chat']) {
      if (!profile.thumbnails?.[area]) continue;
      const img = document.createElement('img'); img.src = profile.thumbnails[area]; img.alt = ''; images.append(img);
    }
    const text = document.createElement('span'), name = document.createElement('strong'), detail = document.createElement('small');
    name.textContent = `${profile.id === data.activeId ? 'Current · ' : ''}${profile.name}${profile.saved ? ' · Saved' : ''}`;
    const veil = fadeValue(profile.veil, .75), sidebarVeil = fadeValue(profile.sidebarVeil, Math.min(1, veil + .10));
    detail.textContent = `${labels[profile.mode]} · Chat ${(profile.chatEnabled ?? profile.mode !== 'sidebar') ? `${Math.round(veil * 100)}%` : 'off'} · Left ${(profile.sidebarEnabled ?? profile.mode !== 'chat') ? `${Math.round(sidebarVeil * 100)}%` : 'off'} · Right ${profile.rightEnabled && profile.mode !== 'chat' ? `${Math.round(fadeValue(profile.rightVeil, sidebarVeil) * 100)}%` : 'off'} · Terminal ${profile.terminalEnabled && profile.mode !== 'chat' ? `${Math.round(fadeValue(profile.terminalVeil, sidebarVeil) * 100)}%` : 'off'} · ${new Date(profile.updatedAt).toLocaleDateString()}`;
    text.append(name, detail); button.append(images, text);
    button.addEventListener('click', () => runBackgroundOperation('load', async () => {
      loadBackgroundPreview(await window.prism.loadBackground(profile.id)); $('history-dialog').close(); wallpaperStatus('Background loaded. Apply to use it, or keep editing.');
    }));
    list.append(button);
  }
  if (!data.profiles.length) { const p = document.createElement('p'); p.textContent = 'Your applied backgrounds will appear here.'; list.append(p); }
}
$('wallpaper-save').addEventListener('click', () => { $('background-save-error').textContent = ''; $('background-save-name').value = ''; $('background-save-dialog').showModal(); });
$('background-save-form').addEventListener('submit', event => {
  event.preventDefault();
  return runBackgroundOperation('save', async () => {
    const data = await window.prism.saveBackground(backgroundSettings(), $('background-save-name').value.trim()); $('background-save-dialog').close(); if (!acceptBackgroundUpdate(data)) return; renderBackgroundHistory(data); wallpaperStatus('Background saved. Load it from History.');
  }, error => { $('background-save-error').textContent = error.message; wallpaperStatus(error.message, true); });
});
$('background-startup').disabled = !window.prism;
$('background-startup').addEventListener('change', async () => {
  const checkbox = $('background-startup'), requested = checkbox.checked; checkbox.disabled = true;
  try { checkbox.checked = await window.prism.setBackgroundStartup(requested); checkbox.indeterminate = false; checkbox.title = ''; startupWarning = ''; wallpaperStatus(checkbox.checked ? 'Prism will start with Windows.' : 'Prism will no longer start with Windows.'); }
  catch (error) { checkbox.checked = !requested; checkbox.indeterminate = !!startupWarning; wallpaperStatus(error.message, true); }
  finally { checkbox.disabled = false; }
});
if (window.prism) {
  window.prism.onBackgroundStatus(update => {
    if (typeof update === 'string') return renderConnection(update);
    if ((update?.history || update?.removalRequested) && !acceptBackgroundUpdate(update)) return;
    if (update?.history) { backgroundStorageReady = !update.history.error; renderBackgroundHistory(update.history); }
    if (update?.removalRequested) { wallpaperApplied = false; pendingApplyVersion = null; backgroundFailure = false; previewWallpaper(); wallpaperStatus(update.message); }
    if (backgroundFailure) return;
    if (!acceptBackgroundUpdate(update?.connection || update, true)) return;
    if (update?.connection?.code === 'applied') { wallpaperApplied ||= pendingApplyVersion !== null && pendingApplyVersion === draftVersion; pendingApplyVersion = null; previewWallpaper(); if (wallpaperApplied) wallpaperStatus('Background applied and saved.'); }
    renderConnection(update?.connection || update);
    if (update?.message) $('background-connection').textContent = update.message;
  });
  $('connection-primary').addEventListener('click', () => $('wallpaper-start').click());
  $('connection-cancel').addEventListener('click', async () => {
    if (cancellingStart) return;
    cancellingStart = true; previewWallpaper();
    try { const result = await window.prism.cancelBackgroundStart(); if (acceptBackgroundUpdate(result, true)) { renderConnection(result); wallpaperStatus(result.cancelled === false ? 'Codex is already opening. Cancel cannot undo an opening that has started.' : 'Automatic opening cancelled.'); } }
    catch (error) { wallpaperStatus(error.message, true); }
    finally { cancellingStart = false; previewWallpaper(); }
  });
  $('connection-check').addEventListener('click', () => runBackgroundOperation('check', async () => renderConnection(await window.prism.checkBackgroundConnection())));
  $('connection-details').addEventListener('click', () => { $('connection-detail-text').textContent = connectionDetail; $('connection-details-dialog').showModal(); });
  $('connection-recovery').addEventListener('click', () => $('connection-recovery-dialog').showModal());
  $('recovery-check').addEventListener('click', () => $('connection-check').click());
  $('open-task-manager').addEventListener('click', () => runBackgroundOperation('task-manager', async () => { await window.prism.openTaskManager(); }));
  window.prism.backgrounds().then(data => {
    if (!acceptBackgroundUpdate(data)) return;
    backgroundStorageReady = !data.error;
    renderBackgroundHistory(data);
    $('background-connection').textContent = data.status || '';
    renderConnection(data.connection);
    if (data.active) loadBackgroundPreview(data.active);
    previewWallpaper();
    if (data.warning) wallpaperStatus(data.warning, true);
    else if (startupWarning) wallpaperStatus('Your saved backgrounds are available.');
    if (data.error) { backgroundStorageReady = false; previewWallpaper(); wallpaperStatus(data.error, true); }
  }).catch(error => { backgroundStorageReady = false; previewWallpaper(); wallpaperStatus(error.message, true); });
  window.prism.checkBackgroundConnection?.().then(renderConnection).catch(error => renderConnection({ code:'unknown', detail:error.message }));
} else renderBackgroundHistory({ profiles: [], activeId: null });
