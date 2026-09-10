export const PREFIX = 'codex-theme-v1:';
const color = /^#[0-9a-fA-F]{6}$/;
const families = new Set('absolutely ayu catppuccin codex dracula everforest github gruvbox linear lobster material matrix monokai night-owl nord notion one oscurange proof raycast rose-pine sentry solarized temple tokyo-night vercel vscode-plus xcode'.split(' '));
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function knownKeys(value, allowed) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Expected a theme object.');
  requireValue(Object.keys(value).every(key => allowed.includes(key)), 'This theme contains fields Prism does not support. No fields were silently discarded.');
}
function hex(value, name) {
  requireValue(typeof value === 'string' && color.test(value), `${name} must be a six-digit hex color.`);
  return value.toUpperCase();
}
function font(value) {
  requireValue(value === null || (typeof value === 'string' && value.length <= 100 && !/[\x00-\x1f]/.test(value)), 'Font names must be plain text, up to 100 characters.');
  return value;
}
export function normalize(value) {
  requireValue(value && typeof value === 'object', 'Expected a Codex theme.');
  knownKeys(value, ['codeThemeId', 'theme', 'variant']);
  requireValue(['dark', 'light'].includes(value.variant), 'Choose a dark or light theme.');
  requireValue(families.has(value.codeThemeId), 'This code theme family is not supported by Prism.');
  const darkOnly = 'ayu dracula lobster material matrix monokai night-owl nord oscurange sentry temple tokyo-night'.split(' ');
  requireValue(!(value.variant === 'light' && darkOnly.includes(value.codeThemeId)) && !(value.variant === 'dark' && value.codeThemeId === 'proof'), 'Code theme family does not support this light/dark variant.');
  const t = value.theme;
  requireValue(t && typeof t === 'object', 'Theme colors are missing.');
  knownKeys(t, ['accent', 'accentSource', 'contrast', 'fonts', 'ink', 'opaqueWindows', 'semanticColors', 'surface']);
  requireValue(Number.isInteger(t.contrast) && t.contrast >= 0 && t.contrast <= 100, 'Panel contrast must be an integer from 0 to 100.');
  requireValue(typeof t.opaqueWindows === 'boolean', 'Window opacity must be true or false.');
  requireValue(t.fonts && t.semanticColors, 'Theme fonts or semantic colors are missing.');
  knownKeys(t.fonts, ['code', 'ui', 'content', 'codeFace', 'uiFace', 'contentFace']);
  knownKeys(t.semanticColors, ['diffAdded', 'diffRemoved', 'skill']);
  const fonts = { code: font(t.fonts.code), ui: font(t.fonts.ui) };
  if (t.fonts.content !== undefined) fonts.content = font(t.fonts.content);
  for (const key of ['codeFace', 'uiFace', 'contentFace']) {
    if (t.fonts[key] === undefined) continue;
    const face = t.fonts[key];
    requireValue(face && typeof face === 'object', 'Invalid font face.');
    knownKeys(face, ['family', 'fullName', 'postscriptName']);
    fonts[key] = Object.fromEntries(['family', 'fullName', 'postscriptName'].map(k => {
      requireValue(typeof face[k] === 'string' && face[k].length <= 200, 'Invalid font face name.');
      return [k, face[k]];
    }));
  }
  const theme = {
    accent: hex(t.accent, 'Accent'), contrast: t.contrast, fonts,
    ink: hex(t.ink, 'Text'), opaqueWindows: t.opaqueWindows,
    semanticColors: Object.fromEntries(['diffAdded', 'diffRemoved', 'skill'].map(k => [k, hex(t.semanticColors[k], k)])),
    surface: hex(t.surface, 'Background')
  };
  if (t.accentSource !== undefined) {
    requireValue(['custom', 'chatgpt'].includes(t.accentSource), 'Invalid accent source.');
    theme.accentSource = t.accentSource;
  }
  return { codeThemeId: value.codeThemeId, theme, variant: value.variant };
}
export function parse(text) {
  requireValue(typeof text === 'string' && text.length <= 32768, 'Theme text must be smaller than 32 KB.');
  text = text.trim();
  requireValue(text.startsWith(PREFIX), 'Paste the complete text from Codex → Settings → Appearance → Copy theme.');
  let body = text.slice(PREFIX.length);
  try { if (!body.startsWith('{')) body = decodeURIComponent(body); return normalize(JSON.parse(body)); }
  catch (error) {
    if (error instanceof SyntaxError || error instanceof URIError) throw new Error('This theme text is incomplete or malformed.');
    throw error;
  }
}
export function serialize(value) { return PREFIX + JSON.stringify(normalize(value)); }
export function ratio(a, b) {
  const luminance = value => {
    hex(value, 'Color');
    return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function preset(name, description, variant, surface, ink, accent) {
  return { name, description, payload: normalize({ codeThemeId: 'codex', variant, theme: {
    surface, ink, accent, contrast: 55, opaqueWindows: true, fonts: { code: null, ui: null },
    semanticColors: variant === 'dark' ? { diffAdded: '#91C99B', diffRemoved: '#ED9696', skill: '#C4A8ED' } : { diffAdded: '#276D3B', diffRemoved: '#AE3434', skill: '#7447A3' }
  } }) };
}
export const presets = [
  preset('Afterglow', 'Soft violet, quiet evenings', 'dark', '#1D1B25', '#EBE7F2', '#BBA4EF'),
  preset('Graphite', 'A little less light. A little more focus.', 'dark', '#18191B', '#E5E6E8', '#ADC6DC'),
  preset('Sea glass', 'Deep green with a cool mint accent', 'dark', '#172320', '#E1EDE6', '#9AD9C1'),
  preset('Ember', 'Warm ink and a spark of copper', 'dark', '#28201C', '#EEE4DB', '#E3AC7A'),
  preset('Paper', 'Chalk, warm grey, and blue ink', 'light', '#F4F1EA', '#292C35', '#405CB3'),
  preset('Orchid', 'Pale lilac with plum details', 'light', '#F3EEF6', '#342B3D', '#805094')
];

export function readLibrary(storage) {
  const raw = storage.getItem('prism.library.v1');
  if (!raw) return { themes: [], backups: [] };
  const value = JSON.parse(raw);
  requireValue(Array.isArray(value.themes) && value.themes.length <= 200 && Array.isArray(value.backups) && value.backups.length <= 100, 'Saved library is invalid. Export your browser data before resetting it.');
  for (const entry of [...value.themes, ...value.backups]) {
    requireValue(typeof entry.id === 'string' && typeof entry.name === 'string' && entry.name.length <= 60, 'Saved theme metadata is invalid.');
    normalize(entry.payload);
  }
  return value;
}
export function saveLibrary(storage, library) {
  requireValue(library.themes.length <= 200 && library.backups.length <= 100, 'Library is full. Export older themes before removing them.');
  storage.setItem('prism.library.v1', JSON.stringify(library));
}
