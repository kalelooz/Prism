import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { wallpaperOptions } from './wallpaper.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const empty = () => ({ version: 1, profiles: [], activeId: null, pendingRemoval: false, launchApproved: false });
async function atomic(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { flag: 'wx' });
  await rename(temporary, file);
}

export async function openBackgroundStore(directory) {
  await mkdir(directory, { recursive: true });
  const manifest = join(directory, 'backgrounds.json');
  let state;
  try {
    const text = await readFile(manifest, 'utf8');
    if (text.length > 2 * 1024 * 1024) throw new Error('Background history is too large.');
    state = JSON.parse(text);
    if (state.version !== 1 || !Array.isArray(state.profiles) || typeof state.pendingRemoval !== 'boolean' || typeof state.launchApproved !== 'boolean') throw new Error('Invalid background history.');
    for (const p of state.profiles) {
      if (!validId(p.id) || !validId(p.image) || !validId(p.sidebarImage) || typeof p.name !== 'string' || p.name.length > 80 || typeof p.saved !== 'boolean' || !Number.isFinite(p.updatedAt)) throw new Error('Invalid saved background.');
      for (const key of ['rightImage','terminalImage']) if (p[key] !== undefined && !validId(p[key])) throw new Error('Invalid saved background.');
      wallpaperOptions({ ...p, image: 'data:image/png;base64,AA==', sidebarImage: 'data:image/png;base64,AA==', rightImage: 'data:image/png;base64,AA==', terminalImage: 'data:image/png;base64,AA==' });
    }
    if (new Set(state.profiles.map(p => p.id)).size !== state.profiles.length || (state.activeId !== null && !state.profiles.some(p => p.id === state.activeId))) throw new Error('Invalid active background.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Your background history could not be read. It has been left untouched.');
    state = empty();
  }
  async function commit(next) {
    const text = JSON.stringify(next);
    if (text.length > 2 * 1024 * 1024) throw new Error('Background history is full. Existing setups have been preserved.');
    await atomic(manifest, text);
    state = next;
  }
  async function putImage(image) {
    const id = hash(image), file = join(directory, `${id}.image`);
    // Content-addressed copies keep history usable even if the original image moves.
    try { if (await readFile(file, 'utf8') === image) return id; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await atomic(file, image);
    return id;
  }
  async function image(id) {
    if (!validId(id)) throw new Error('Invalid saved image.');
    const data = await readFile(join(directory, `${id}.image`), 'utf8');
    if (hash(data) !== id) throw new Error('A saved image is damaged. Choose the image again.');
    return data;
  }
  return {
    snapshot: () => structuredClone(state),
    async load(id) {
      const record = state.profiles.find(p => p.id === id);
      if (!record) throw new Error('That background is no longer in history.');
      const pictures = {}, loaded = new Map();
      for (const key of ['image','sidebarImage','rightImage','terminalImage']) {
        const reference = record[key] ?? record.sidebarImage;
        if (!loaded.has(reference)) loaded.set(reference, await image(reference));
        pictures[key] = loaded.get(reference);
      }
      const result = { ...record, ...wallpaperOptions({ ...record, ...pictures }) };
      for (const key of ['rightImage','terminalImage']) if (record[key] === undefined) delete result[key];
      return result;
    },
    async save(value, { activate = false, name = '' } = {}) {
      const options = wallpaperOptions(value);
      if (typeof name !== 'string' || name.length > 80) throw new Error('Use a background name of 80 characters or fewer.');
      const references = { mode: options.mode, veil: options.veil, sidebarVeil: options.sidebarVeil, image: await putImage(options.image), sidebarImage: await putImage(options.sidebarImage), ...(options.sidebarLinked ? { sidebarLinked: true } : {}), ...(options.clearText ? { clearText: true } : {}), ...(options.soften ? { soften: true } : {}) };
      for (const [key, fallback] of [['chatEnabled', options.mode !== 'sidebar'], ['sidebarEnabled', options.mode !== 'chat']]) if (options[key] !== fallback) references[key] = options[key];
      for (const area of ['right','terminal']) {
        if (options[`${area}Enabled`]) references[`${area}Enabled`] = true;
        if (options.mode === 'separate' && value[`${area}Image`] !== undefined) references[`${area}Image`] = await putImage(options[`${area}Image`]);
        if (options[`${area}Veil`] !== options.sidebarVeil) references[`${area}Veil`] = options[`${area}Veil`];
        if (options[`${area}Linked`] !== options.sidebarLinked) references[`${area}Linked`] = options[`${area}Linked`];
      }
      const id = hash(JSON.stringify(references) + (name.trim() ? `:${randomUUID()}` : ''));
      const previous = state.profiles.find(p => p.id === id);
      const record = { ...references, id, name: name.trim() || previous?.name || 'Background', saved: !!name.trim() || !!previous?.saved, updatedAt: Date.now() };
      const profiles = [record, ...state.profiles.filter(p => p.id !== id)];
      const activeId = activate ? id : state.activeId;
      // ponytail: keep all history and deduplicate image copies; add explicit cleanup if disk usage becomes a concern.
      await commit({ ...state, profiles, activeId, pendingRemoval: activate ? false : state.pendingRemoval });
      return record;
    },
    async remove() { await commit({ ...state, activeId: null, pendingRemoval: true }); },
    async removed() { await commit({ ...state, pendingRemoval: false }); },
    async approveLaunch() { await commit({ ...state, launchApproved: true }); }
  };
}
