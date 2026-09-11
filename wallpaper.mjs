export const WALLPAPER_PORT = 9339;
export function wallpaperOptions(value) {
  if (!value || typeof value !== 'object') throw new Error('Choose a local image.');
  if (!Number.isFinite(value.veil) || value.veil < 0.25 || value.veil > 1) throw new Error('Background dimming must be between 25% and 100%.');
  const mode = value.mode ?? 'span', sidebarVeil = value.sidebarVeil ?? value.veil;
  const rightVeil = value.rightVeil === undefined ? sidebarVeil : value.rightVeil, terminalVeil = value.terminalVeil === undefined ? sidebarVeil : value.terminalVeil;
  for (const key of ['clearText', 'soften', 'sidebarLinked', 'rightLinked', 'terminalLinked', 'chatEnabled', 'sidebarEnabled', 'rightEnabled', 'terminalEnabled']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error('Reading options must be on or off.');
  if (!['span','duplicate','separate','chat','sidebar'].includes(mode)) throw new Error('Choose a wallpaper layout.');
  for (const opacity of [sidebarVeil, rightVeil, terminalVeil]) if (!Number.isFinite(opacity) || opacity < .25 || opacity > 1) throw new Error('Panel fading must be between 25% and 100%.');
  const enabled = [value.chatEnabled ?? mode !== 'sidebar', value.sidebarEnabled ?? mode !== 'chat', value.rightEnabled ?? false, value.terminalEnabled ?? false];
  if (!enabled.some(Boolean)) throw new Error('Select at least one pane.');
  const pictures = mode === 'separate' ? [value.image, value.sidebarImage, value.rightImage === undefined ? value.sidebarImage : value.rightImage, value.terminalImage === undefined ? value.sidebarImage : value.terminalImage] : Array(4).fill(value.image);
  for (const [index, picture] of pictures.entries()) if (enabled[index] || picture !== undefined) {
    if (typeof picture !== 'string' || picture.length > 12 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(picture)) throw new Error('Choose a local PNG, JPEG, or WebP image smaller than 8 MB.');
  }
  // Keep the existing complete profile format; only unchecked panes may inherit a placeholder image.
  const fallback = pictures.find(picture => picture !== undefined);
  if (fallback === undefined) throw new Error('Choose a local image.');
  const [image, sidebarImage, rightImage, terminalImage] = pictures.map(picture => picture ?? fallback);
  return { image, veil: value.veil, mode, sidebarImage, sidebarVeil, rightImage, rightVeil, terminalImage, terminalVeil, chatEnabled: enabled[0], sidebarEnabled: enabled[1], rightEnabled: enabled[2], terminalEnabled: enabled[3], sidebarLinked: value.sidebarLinked ?? false, rightLinked: value.rightLinked ?? value.sidebarLinked ?? false, terminalLinked: value.terminalLinked ?? value.sidebarLinked ?? false, clearText: value.clearText ?? false, soften: value.soften ?? false };
}
export function targetSocket(target) {
  if (target?.type !== 'page' || typeof target.id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(target.id)) throw new Error('Not a renderer target.');
  const page = new URL(target.url), socket = new URL(target.webSocketDebuggerUrl);
  if (page.protocol !== 'app:' || /avatar|overlay/i.test(page.pathname + page.search) ||
      socket.protocol !== 'ws:' || socket.hostname !== '127.0.0.1' || socket.port !== String(WALLPAPER_PORT) ||
      socket.username || socket.password || socket.search || socket.hash || socket.pathname !== `/devtools/page/${target.id}`) throw new Error('Not an eligible local Codex renderer.');
  return socket.href;
}
// Original small adapter; selector names were checked against the MIT Dream Skin reference.
// No arbitrary scripts or CSS are accepted from wallpaper files or the UI.
export function wallpaperExpression(options) {
  const checked = wallpaperOptions(options);
  return `(${installWallpaper.toString()})(${JSON.stringify(checked)})`;
}
export const REMOVE_WALLPAPER = `(() => {
  document.getElementById('prism-wallpaper-style')?.remove();
  document.getElementById('prism-wallpaper-layer')?.remove();
  document.documentElement.removeAttribute('data-prism-wallpaper');
  document.documentElement.removeAttribute('data-prism-profile');
  document.documentElement.removeAttribute('data-prism-appearance');
  return { removed: !document.getElementById('prism-wallpaper-layer') };
})()`;
export const PROBE_WALLPAPER = `(() => ({
  profile: document.documentElement.getAttribute('data-prism-profile'),
  installed: !!document.getElementById('prism-wallpaper-style') && !!document.getElementById('prism-wallpaper-layer'),
  appearance: (() => { const main = document.querySelector('main.main-surface, main[data-app-shell-main-surface], main[class*="_MainContentSurface_"]'); return main ? getComputedStyle(main).color : null; })(),
  appliedAppearance: document.documentElement.getAttribute('data-prism-appearance'),
  shell: !!document.querySelector('main.main-surface, main[data-app-shell-main-surface], main[class*="_MainContentSurface_"]'),
  sidebar: !!document.querySelector('aside.app-shell-left-panel'),
  composer: !!document.querySelector('[contenteditable="true"],textarea,[role="textbox"]')
}))()`;
function installWallpaper({ image, veil, mode, sidebarImage, sidebarVeil, rightImage, rightVeil, terminalImage, terminalVeil, chatEnabled, sidebarEnabled, rightEnabled, terminalEnabled, clearText }) {
  const shell = document.querySelector('main.main-surface, main[data-app-shell-main-surface], main[class*="_MainContentSurface_"]');
  if (!shell) throw new Error('Codex layout does not match this adapter. Nothing was changed.');
  const foreground = getComputedStyle(shell).color.match(/[\d.]+/g)?.map(Number) || [240, 240, 240];
  const tint = (foreground[0] + foreground[1] + foreground[2]) / 3 > 128 ? '15,15,20' : '246,246,248';
  let layer = document.getElementById('prism-wallpaper-layer');
  if (!layer) { layer = document.createElement('div'); layer.id = 'prism-wallpaper-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.prepend(layer); }
  let sheet = document.getElementById('prism-wallpaper-style');
  if (!sheet) { sheet = document.createElement('style'); sheet.id = 'prism-wallpaper-style'; document.head.append(sheet); }
  document.documentElement.setAttribute('data-prism-wallpaper', 'on');
  document.documentElement.setAttribute('data-prism-appearance', getComputedStyle(shell).color);
  const main = 'main:is(.main-surface,[data-app-shell-main-surface],[class*="_MainContentSurface_"])';
  const side = 'aside.app-shell-left-panel';
  const right = '[class~="absolute"][class*="--app-shell-panel-background"]';
  const terminal = '[class~="absolute"][class~="border-t"]:has([data-app-shell-tabs])';
  const scope = 'html[data-prism-wallpaper]';
  const dim = opacity => `linear-gradient(rgba(${tint},${opacity}),rgba(${tint},${opacity}))`;
  // Paint each area's image under its own tint; nested panels must not inherit the chat's shading.
  // Keep large data URLs out of CSS variables: Chromium rejects variable values over 2 MiB.
  const background = (picture, opacity) => `${dim(opacity)},url("${picture}") center/cover no-repeat ${mode === 'span' ? 'fixed ' : ''}rgb(${tint})`;
  const sideEnabled = sidebarEnabled;
  const panelChoices = [[right,rightImage,rightVeil,mode !== 'chat' && rightEnabled],[terminal,terminalImage,terminalVeil,mode !== 'chat' && terminalEnabled]];
  const enabledPanels = panelChoices.filter(([, , , enabled]) => enabled);
  const excludedPanels = panelChoices.filter(([, , , enabled]) => !enabled).map(([area]) => area).join(',');
  const panels = `:is(${enabledPanels.map(([area]) => area).join(',')})`;
  // Each pane owns its descendants, even when the containing chat pane is off.
  const outsidePanels = `:not(:is(${right},${terminal}),:is(${right},${terminal}) *)`;
  const outlineColor = tint === '15,15,20' ? '#000' : '#fff';
  const outlinedAreas = [chatEnabled && `${scope} ${main}`, sideEnabled && `${scope} ${side}`, enabledPanels.length && `${scope} ${panels}`].filter(Boolean).join(',');
  const composer = ':is(.composer-surface-chrome:not([data-composer-utility-bar-variant="home"]),[class*="_ComposerLayoutRoot_"]:not([data-composer-utility-bar-variant="home"]),[data-composer-utility-bar-variant="home"] [class*="_ComposerLayoutBody_"])';
  sheet.textContent = `
${scope} body { isolation:isolate; }
${chatEnabled && mode === 'span' ? `${scope} [class*="_ApplicationMenuTopBar_"] { background:${background(image, veil)}!important; }` : ''}
${scope} #prism-wallpaper-layer { position:fixed; inset:0; z-index:-1; pointer-events:none; background:none; }
${chatEnabled ? `${scope} ${main} { background:${background(image, veil)}!important; border-top-left-radius:0!important; }
${scope} ${main} .thread-scroll-container${outsidePanels},${scope} ${main} [class~="bg-token-main-surface-primary"]${outsidePanels},${scope} ${main} [class~="electron:bg-surface"][class~="windows:rounded-tl-lg"]${outsidePanels} { background:transparent!important; }` : ''}
${sideEnabled ? `${scope} ${side} { background:${background(sidebarImage, sidebarVeil)}!important; }
${scope} ${side}::after { background:transparent!important; }` : ''}
${enabledPanels.map(([area,picture,opacity]) => `${scope} ${area} { --app-shell-panel-background:transparent; background:${background(picture, opacity)}!important; }`).join('\n')}
${enabledPanels.length ? `
${scope} ${panels} [class~="bg-surface"][class~="select-none"],${scope} ${panels} [class~="bg-surface"][class~="select-none"] [class~="sticky"][class~="bg-surface"],${scope} ${panels} [data-codex-xterm],${scope} ${panels} .thread-scroll-container,${scope} ${panels} [class~="bg-token-main-surface-primary"] { background:transparent!important; }
${scope} ${panels} ${composer} { background:rgba(${tint},.92)!important; }` : ''}
${chatEnabled ? `${scope} ${composer}${outsidePanels} { background:rgba(${tint},.92)!important; }` : ''}
${chatEnabled ? `${scope} ${main} [aria-hidden="true"][class~="pointer-events-none"][class~="bg-gradient-to-t"][class~="from-surface"][class~="via-surface"]${outsidePanels} { opacity:.12!important; }` : ''}
${chatEnabled ? `${scope} ${main} > header[class~="fixed"][class~="top-toolbar-sm"] { background:transparent!important; border-bottom:0; }
${scope} ${main} [class*="_MainContentTopFade_"]${outsidePanels} { opacity:0!important; }
${scope} ${main} > header [data-app-shell-header-toolbar] > [class~="text-md"] { background:transparent!important; }
${scope} ${main} > header [data-app-shell-header-toolbar] > [class~="text-md"] button[class~="truncate"]:not(:hover):not(:focus-visible) { background:var(--color-token-main-surface-primary,rgb(${tint})); }
/* Clip the stationary viewport; clipping the scroller tears text during Chromium scrolling. */
${scope} ${main}:has(> header[class~="fixed"][class~="top-toolbar-sm"]) :has(> .thread-scroll-container)${outsidePanels} { clip-path:inset(max(0px,calc(var(--thread-content-top-inset,0px) - var(--thread-sticky-header-top,calc(var(--spacing,4px) * 8)))) 0 0); }` : ''}
${clearText ? `${outlinedAreas} { text-shadow:-.65px 0 0 ${outlineColor},.65px 0 0 ${outlineColor},0 -.65px 0 ${outlineColor},0 .65px 0 ${outlineColor},-.45px -.45px 0 ${outlineColor},.45px -.45px 0 ${outlineColor},-.45px .45px 0 ${outlineColor},.45px .45px 0 ${outlineColor}; }
${chatEnabled && excludedPanels ? `${scope} :is(${excludedPanels}) { text-shadow:none; }` : ''}
@media (forced-colors:active) { ${outlinedAreas} { text-shadow:none; } }` : ''}
`;

  return { installed: true, imageLayer: !!layer, sidebar: sideEnabled, chat: chatEnabled, rightPanel: mode !== 'chat' && rightEnabled && !!document.querySelector(right), terminalPanel: mode !== 'chat' && terminalEnabled && !!document.querySelector(terminal), pointerEvents: getComputedStyle(layer).pointerEvents };
}
