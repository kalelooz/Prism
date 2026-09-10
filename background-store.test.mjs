import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openBackgroundStore } from './background-store.mjs';
import { backgroundKeeper } from './background-keeper.mjs';
import { wallpaperOptions } from './wallpaper.mjs';

test('saved backgrounds survive reopening; history, restore and removal keep the intended setup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prism-background-test-'));
  try {
    let store = await openBackgroundStore(directory);
    const first = { image: 'data:image/png;base64,AA==', sidebarImage: 'data:image/png;base64,AQ==', mode: 'separate', veil: .85, sidebarVeil: .55 };
    const applied = await store.save(first, { activate: true });
    assert.equal(Object.hasOwn(applied, 'sidebarLinked'), false, 'missing sidebar link must stay out of stored references');
    const copy = await store.save({ ...first, veil: .95, clearText: true, soften: true }, { name: 'Quiet evening' });
    assert.equal(store.snapshot().activeId, applied.id, 'saving a copy must not activate it');
    await store.save(first, { activate: true });
    assert.equal(store.snapshot().profiles.length, 2, 'reapplying the same setup must not duplicate history');
    store = await openBackgroundStore(directory);
    assert.equal(store.snapshot().activeId, applied.id);
    assert.equal((await store.load(copy.id)).name, 'Quiet evening');
    assert.equal((await store.load(copy.id)).clearText, true);
    assert.equal((await store.load(copy.id)).soften, true);
    assert.equal((await store.load(applied.id)).clearText, false, 'older profiles remain unchanged');
    assert.equal((await store.load(applied.id)).sidebarLinked, false, 'missing sidebar link should load as false');
    assert.equal((await store.load(applied.id)).sidebarImage, first.sidebarImage);
    assert.equal((await store.load(applied.id)).sidebarVeil, .55);
    assert.equal((await store.load(applied.id)).rightVeil, .55, 'legacy right panel inherits the prior shared fade');
    assert.equal(Object.hasOwn(await store.load(applied.id),'terminalImage'),false, 'legacy terminal keeps its inherited image choice');
    await assert.rejects(store.save({ ...first, sidebarImage: 'https://example.com/image.png' }));
    await assert.rejects(store.load('../other-file'));
    assert.equal(store.snapshot().profiles.length, 2);
    let online = true, partial = false, renderer = null, installs = 0;
    const operate = async (options, flags) => {
      if (!online) throw new Error('Codex is closed.');
      if (options === null) { if (partial) return { waiting: true, message: 'One window is unavailable' }; renderer = null; return { removed: true }; }
      assert.equal(flags.ensure, true);
      if (!renderer) { renderer = options; installs++; }
      return { installed: true };
    };
    let restore = backgroundKeeper(store, operate);
    await restore(); await restore(); assert.equal(installs, 1);
    renderer = null; // A fresh renderer after reload/restart has no wallpaper.
    restore = backgroundKeeper(await openBackgroundStore(directory), operate);
    await restore(); assert.equal(installs, 2);
    assert.equal(renderer.sidebarVeil, .55);
    online = false;
    await store.remove();
    restore = backgroundKeeper(store, operate);
    assert.equal((await restore()).waiting, true);
    assert.equal(store.snapshot().activeId, null);
    store = await openBackgroundStore(directory);
    assert.equal(store.snapshot().pendingRemoval, true);
    online = true; restore = backgroundKeeper(store, operate);
    partial = true;
    assert.equal((await restore()).waiting, true);
    assert.equal(store.snapshot().pendingRemoval, true, 'partial removal must remain queued');
    partial = false;
    await restore(); await restore();
    assert.equal(renderer, null); assert.equal(installs, 2, 'removal must not be undone by restoration');
    assert.equal(store.snapshot().profiles.length, 2, 'removal preserves history');
    assert.equal(store.snapshot().pendingRemoval, false);
    const namedFirst = await store.save(first, { name: 'First identical copy' });
    const namedSecond = await store.save(first, { name: 'Second identical copy' });
    store = await openBackgroundStore(directory);
    assert.notEqual(namedFirst.id, namedSecond.id);
    assert.equal((await store.load(namedFirst.id)).name, 'First identical copy');
    assert.equal((await store.load(namedSecond.id)).name, 'Second identical copy');
    assert.equal(store.snapshot().activeId, null, 'named copies never change the current background');
    const unlinked = await store.save({ ...first, sidebarLinked: false }, { name: 'Explicitly unlinked' });
    assert.equal(Object.hasOwn(unlinked, 'sidebarLinked'), false, 'false sidebar link must be omitted from stored references');
    const linked = await store.save({ ...first, sidebarLinked: true }, { name: 'Linked sidebar' });
    assert.equal(linked.sidebarLinked, true);
    store = await openBackgroundStore(directory);
    assert.equal((await store.load(unlinked.id)).sidebarLinked, false);
    assert.equal((await store.load(linked.id)).sidebarLinked, true, 'saved sidebar link must survive reopening');
    const split = await store.save({...first,rightImage:'data:image/png;base64,Ag==',terminalImage:'data:image/png;base64,Aw==',rightVeil:.4,terminalVeil:.95,sidebarLinked:true,rightLinked:false,terminalLinked:true,rightEnabled:true,terminalEnabled:false}, {name:'Independent panels'});
    assert.equal(split.rightLinked,false, 'store explicit false when the left panel remains linked');
    store = await openBackgroundStore(directory);
    const restored = await store.load(split.id);
    assert.equal(restored.rightEnabled,true); assert.equal(restored.terminalEnabled,false);
    assert.equal(restored.sidebarVeil,.55); assert.equal(restored.rightVeil,.4); assert.equal(restored.terminalVeil,.95);
    assert.equal(restored.rightImage,'data:image/png;base64,Ag=='); assert.equal(restored.terminalImage,'data:image/png;base64,Aw==');
    assert.equal(restored.rightLinked,false); assert.equal(restored.terminalLinked,true);
    const inherited = await store.load(applied.id);
    assert.equal(inherited.rightEnabled,false); assert.equal(inherited.terminalEnabled,false,'legacy panels require an explicit opt-in');
    const disabled=await store.save({...restored,rightEnabled:false,terminalEnabled:true});
    store=await openBackgroundStore(directory);
    assert.equal((await store.load(disabled.id)).rightEnabled,false); assert.equal((await store.load(disabled.id)).terminalEnabled,true);
    for(const key of ['chatEnabled','sidebarEnabled','rightEnabled','terminalEnabled']) await assert.rejects(store.save({...restored,[key]:'yes'}));
    const terminalOnly = await store.save({...restored,chatEnabled:false,sidebarEnabled:false,rightEnabled:false,terminalEnabled:true});
    store=await openBackgroundStore(directory);
    const terminalRestored=await store.load(terminalOnly.id);
    assert.equal(terminalRestored.chatEnabled,false); assert.equal(terminalRestored.sidebarEnabled,false); assert.equal(terminalRestored.terminalEnabled,true);
    assert.equal((await store.load(applied.id)).chatEnabled,true, 'legacy default chat remains enabled');
    inherited.sidebarImage = 'data:image/png;base64,BA==';
    const changedLeft = await store.save(inherited, {name:'Changed inherited left'});
    store = await openBackgroundStore(directory);
    const changedRestored = await store.load(changedLeft.id);
    assert.equal(Object.hasOwn(changedRestored,'rightImage'),false);
    assert.equal(wallpaperOptions(changedRestored).rightImage,inherited.sidebarImage);
    assert.equal(wallpaperOptions(changedRestored).terminalImage,inherited.sidebarImage);
    const explicitlySame = await store.save({...inherited,rightImage:inherited.sidebarImage},{name:'Explicit same image'});
    const sameRestored = await store.load(explicitlySame.id); sameRestored.sidebarImage = first.sidebarImage;
    assert.equal(wallpaperOptions(sameRestored).rightImage,inherited.sidebarImage, 'an explicitly chosen equal image stays independent');
    await assert.rejects(store.save({...restored,terminalImage:'https://example.com/private'}));
    const manifest = join(directory, 'backgrounds.json');
    for (let mask = 1; mask < 16; mask++) {
      const draft = {mode:'separate', veil:.75};
      for (const [i, area] of ['chat','sidebar','right','terminal'].entries()) {
        draft[`${area}Enabled`] = !!(mask & (1 << i));
        if (draft[`${area}Enabled`]) draft[area === 'chat' ? 'image' : `${area}Image`] = first.image;
      }
      const saved = await store.save(draft);
      store = await openBackgroundStore(directory);
      const restored = await store.load(saved.id);
      for (const area of ['chat','sidebar','right','terminal']) assert.equal(restored[`${area}Enabled`], draft[`${area}Enabled`], `Separate ${mask}: ${area} round trip`);
      const required = Object.keys(draft).find(key => key === 'image' || key.endsWith('Image'));
      const missing = {...draft}; delete missing[required];
      await assert.rejects(store.save(missing), `Separate ${mask}: missing selected image must fail`);
      await assert.rejects(store.save({...draft, [required]:'file:///private'}));
    }
    const invalidReference = store.snapshot(); invalidReference.profiles[0].rightImage = '../outside';
    await writeFile(manifest, JSON.stringify(invalidReference));
    await assert.rejects(openBackgroundStore(directory), /left untouched/);
    await writeFile(manifest, '{damaged');
    await assert.rejects(openBackgroundStore(directory), /left untouched/);
    assert.equal(await readFile(manifest, 'utf8'), '{damaged');
  } finally {
    const absolute = resolve(directory), prefix = join(resolve(tmpdir()), 'prism-background-test-');
    assert.ok(absolute.startsWith(prefix) && absolute.length > prefix.length);
    await rm(absolute, { recursive: true });
  }
});
