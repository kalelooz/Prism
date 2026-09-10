import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallpaperOptions, wallpaperExpression, targetSocket, REMOVE_WALLPAPER } from './wallpaper.mjs';
import { runInNewContext } from 'node:vm';
test('wallpapers reject active content and nonlocal renderer endpoints', () => {
  const valid = { image: 'data:image/png;base64,aGVsbG8=', veil: 0.65 };
  assert.equal(wallpaperOptions(valid).mode, 'span');
  assert.equal(wallpaperOptions(valid).rightEnabled, false);
  assert.equal(wallpaperOptions(valid).terminalEnabled, false);
  assert.equal(wallpaperOptions({...valid,rightEnabled:true}).rightEnabled, true);
  assert.equal(wallpaperOptions({...valid,rightEnabled:true}).terminalEnabled, false);
  assert.equal(wallpaperOptions(valid).chatEnabled, true);
  assert.equal(wallpaperOptions(valid).sidebarEnabled, true);
  assert.throws(() => wallpaperOptions({...valid,chatEnabled:false,sidebarEnabled:false,rightEnabled:false,terminalEnabled:false}), /Select at least one pane/);
  assert.equal(wallpaperOptions({...valid,mode:'sidebar'}).chatEnabled, false);
  assert.equal(wallpaperOptions({...valid,mode:'chat'}).sidebarEnabled, false);
  for (const key of ['chatEnabled','sidebarEnabled','rightEnabled','terminalEnabled']) for (const value of ['true',1,null]) assert.throws(() => wallpaperOptions({...valid,[key]:value}));
  assert.equal(wallpaperOptions(valid).sidebarLinked, false);
  assert.equal(wallpaperOptions({ ...valid, sidebarLinked: false }).sidebarLinked, false);
  assert.equal(wallpaperOptions({ ...valid, sidebarLinked: true }).sidebarLinked, true);
  assert.equal(wallpaperOptions({ ...valid, veil: 1 }).veil, 1);
  assert.ok(wallpaperExpression(valid).includes('pointer-events:none'));
  for (const image of ['https://example.com/a.png', 'file:///C:/private.txt', 'data:image/svg+xml;base64,aGVsbG8=', 'data:image/png;base64,abc");alert(1)//']) assert.throws(() => wallpaperOptions({ ...valid, image }));
  for (const veil of [0, 1.01, NaN, '0.5']) assert.throws(() => wallpaperOptions({ ...valid, veil }));
  const target = { id: 'A1', type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9339/devtools/page/A1' };
  assert.equal(targetSocket(target), target.webSocketDebuggerUrl);
  for (const bad of [ { type: 'iframe' }, { url: 'https://chatgpt.com' }, { url: 'app://-/avatar-overlay.html' }, { id: 'other' }, { webSocketDebuggerUrl: 'ws://example.com:9339/devtools/page/A1' }, { webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/A1' }, { webSocketDebuggerUrl: 'ws://user@127.0.0.1:9339/devtools/page/A1' } ]) assert.throws(() => targetSocket({ ...target, ...bad }));
});
test('wallpaper replacement and removal touch only the owned layer', () => {
  const nodes = new Map(), attributes = new Map();
  const document = {
    querySelector: selector => selector.startsWith('main.') || selector === 'aside.app-shell-left-panel' ? {} : null,
    getElementById: id => nodes.get(id),
    createElement: () => ({ setAttribute() {}, remove() { nodes.delete(this.id); } }),
    body: { prepend: node => nodes.set(node.id, node) }, head: { append: node => nodes.set(node.id, node) },
    documentElement: { setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) }
  };
  const context = { document, getComputedStyle: () => ({ color: 'rgb(240,240,240)', pointerEvents: 'none' }) };
  const expression = wallpaperExpression({ image: 'data:image/png;base64,aGVsbG8=', veil: .65 });
  assert.equal(runInNewContext(expression, context).installed, true);
  assert.equal(runInNewContext(expression, context).pointerEvents, 'none');
  assert.equal(nodes.size, 2);
  assert.ok(nodes.get('prism-wallpaper-style').textContent.includes('[class*="_ApplicationMenuTopBar_"] { background:linear-gradient(rgba(15,15,20,0.65),rgba(15,15,20,0.65)),url('), 'top menu must paint its own image and tint');
  assert.ok(!nodes.get('prism-wallpaper-style').textContent.includes('#root { background:transparent'), 'a spanning image must not leak behind unselected native panes');
  for (const [color, tint] of [['rgb(240,240,240)', '#000'], ['rgb(30,30,30)', '#fff']]) {
    context.getComputedStyle = () => ({ color, pointerEvents: 'none' });
    runInNewContext(wallpaperExpression({ image: 'data:image/png;base64,aGVsbG8=', veil:.5, clearText:true, soften:true }), context);
    const css = nodes.get('prism-wallpaper-style').textContent;
    assert.ok(css.includes(`text-shadow:-.65px 0 0 ${tint}`));
    assert.ok(!css.includes('backdrop-filter'), 'old blur setting no longer adds an effect');
    assert.ok(!css.includes('.94'), 'outline does not add a reading panel');
  }
  runInNewContext(expression, context);
  assert.ok(!nodes.get('prism-wallpaper-style').textContent.includes('text-shadow'), 'turning off restores the original style');
  runInNewContext(wallpaperExpression({ image: 'data:image/png;base64,aGVsbG8=', veil:.85, mode:'sidebar' }), context);
  assert.ok(!nodes.get('prism-wallpaper-style').textContent.includes('composer-surface-chrome'));
  assert.ok(!nodes.get('prism-wallpaper-style').textContent.includes('.thread-scroll-container'));
  assert.equal(runInNewContext(REMOVE_WALLPAPER, context).removed, true);
  assert.equal(nodes.size, 0); assert.equal(attributes.size, 0);
  document.querySelector = () => null;
  assert.throws(() => runInNewContext(expression, context), /layout does not match/);
  assert.equal(nodes.size, 0);
});

test('layouts validate separate images and independent dimming', () => {
 const image = 'data:image/png;base64,aGVsbG8=';
 for (const mode of ['span','duplicate','separate','chat','sidebar']) {
  const result = wallpaperOptions({ image, veil:.85, mode, sidebarImage:image, sidebarVeil:.5 });
  assert.equal(result.mode,mode); assert.equal(result.sidebarVeil,.5);
 }
 assert.throws(() => wallpaperOptions({image,veil:.85,mode:'separate'}));
 assert.throws(() => wallpaperOptions({image,veil:.85,mode:'bad'}));
 assert.throws(() => wallpaperOptions({image,veil:.85,sidebarVeil:0}));
 for(const key of ['clearText','soften']) assert.throws(() => wallpaperOptions({image,veil:.85,[key]:'yes'}));
 const legacy = wallpaperOptions({image,veil:.7,sidebarVeil:.85,sidebarLinked:true,mode:'separate',sidebarImage:image});
 for (const area of ['right','terminal']) {
  assert.equal(legacy[`${area}Image`],image); assert.equal(legacy[`${area}Veil`],.85); assert.equal(legacy[`${area}Linked`],true);
  for (const invalid of [null,0,1.01,NaN,'0.6']) assert.throws(() => wallpaperOptions({...legacy,[`${area}Veil`]:invalid}));
  assert.throws(() => wallpaperOptions({...legacy,[`${area}Image`]:'file:///C:/private.txt'}));
  assert.throws(() => wallpaperOptions({...legacy,[`${area}Image`]:null}));
  assert.throws(() => wallpaperOptions({...legacy,[`${area}Linked`]:'yes'}));
 }
 const split = wallpaperOptions({...legacy,rightVeil:.4,terminalVeil:.95,rightLinked:false});
 assert.equal(split.rightVeil,.4); assert.equal(split.terminalVeil,.95); assert.equal(split.sidebarVeil,.85); assert.equal(split.rightLinked,false); assert.equal(split.terminalLinked,true);
});
