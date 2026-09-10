import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presets, parse, serialize, normalize, ratio, readLibrary, saveLibrary, PREFIX } from './theme.mjs';
test('Codex theme round trip, malformed import boundaries, and library persistence', () => {
  for (const entry of presets) {
    assert.deepEqual(parse(serialize(entry.payload)), entry.payload);
    assert.deepEqual(parse(PREFIX + encodeURIComponent(JSON.stringify(entry.payload))), entry.payload);
    assert.ok(ratio(entry.payload.theme.ink, entry.payload.theme.surface) >= 4.5);
  }
  assert.equal(ratio('#000000', '#FFFFFF'), 21);
  for (const bad of ['', '{}', PREFIX + '{', PREFIX + '%zz', 'x'.repeat(32769)]) assert.throws(() => parse(bad));
  for (const change of [p => p.variant = 'both', p => p.codeThemeId = '../../x', p => p.theme.surface = '#fff', p => p.theme.ink = 'url(x)', p => p.theme.contrast = 101, p => p.theme.contrast = 2.5, p => p.theme.opaqueWindows = 'false', p => p.theme.fonts.ui = '\n', p => delete p.theme.semanticColors, p => p.theme.wallpaper = 'image.png', p => p.theme.fonts.unknown = 'lost font']) {
    const p = structuredClone(presets[0].payload); change(p); assert.throws(() => normalize(p));
  }
  const extended = structuredClone(presets[0].payload); extended.theme.fonts.content = 'Segoe UI'; extended.theme.fonts.uiFace = { family: 'Segoe UI', fullName: 'Segoe UI', postscriptName: 'SegoeUI' }; extended.theme.accentSource = 'custom';
  assert.deepEqual(parse(serialize(extended)), extended);
  const memory = new Map(); const storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  assert.deepEqual(readLibrary(storage), { themes: [], backups: [] });
  const library = { themes: [{ id: '1', name: 'Saved palette', payload: presets[0].payload }], backups: [] };
  saveLibrary(storage, library); assert.deepEqual(readLibrary(storage), library);
  const persisted = storage.getItem('prism.library.v1');
  assert.throws(() => saveLibrary({ setItem() { throw new Error('Quota exceeded'); } }, library));
  assert.equal(storage.getItem('prism.library.v1'), persisted);
  memory.set('prism.library.v1', '{broken'); assert.throws(() => readLibrary(storage));
});
