const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const profile = process.env.PRISM_FRONTEND_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), 'prism-frontend-smoke-'));
fs.mkdirSync(profile, { recursive: true });
const picture = `data:image/png;base64,${fs.readFileSync(path.join(root, 'icon.png')).toString('base64')}`;
// Browsers decode the PNG before the inert padding; its URL exercises large photo previews.
const largePicture = `data:image/png;base64,${Buffer.concat([fs.readFileSync(path.join(root, 'icon.png')), Buffer.alloc(2 * 1024 * 1024)]).toString('base64')}`;
const stamp = Date.now();
const profileFor = (id, name, mode, clearText = false, sidebarLinked = false) => ({
  id, name, mode, clearText, veil: .85, sidebarVeil: .7, saved: id === 'p2', updatedAt: stamp - Number(id.slice(1)) * 1000,
  image: picture, sidebarImage: picture, thumbnails: { chat: picture, sidebar: picture }, ...(sidebarLinked ? { sidebarLinked: true } : {})
});
const seeds = [
  profileFor('p0', 'Current setup', 'chat'), profileFor('p1', 'Restore this', 'separate', true, true),
  profileFor('p2', 'Saved setup', 'span'), profileFor('p3', 'Recent three', 'duplicate'),
  profileFor('p4', 'Recent four', 'sidebar'), profileFor('p5', 'Recent five', 'chat')
];
seeds[0].sidebarImage = '';
seeds[0].thumbnails.sidebar = '';
Object.assign(seeds[1], { rightVeil: .62, terminalVeil: .64, rightLinked: false, terminalLinked: false, rightImage: picture, terminalImage: picture });
const fixture = `const initial=${JSON.stringify(seeds)},picture=${JSON.stringify(picture)},largePicture=${JSON.stringify(largePicture)};
const state={profiles:initial,activeId:'p0',revision:0,copied:'',failApply:false,failStartup:false,waiting:false,choice:'image',lastApply:null,savePending:null,applyResponsePending:null,startupWarning:'Fixture startup registry denied',connection:{code:'checking',detail:'',autoStart:false,saved:false},statusCallback:null,checkPending:null};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const history=()=>({profiles:state.profiles,activeId:state.activeId,stateRevision:state.revision,status:'Fixture background connection',startAtLogin:state.startupWarning?null:false,startupWarning:state.startupWarning,connection:state.connection});
window.__fixture={removals:0,saves:0,setFailApply:value=>{state.failApply=value},setFailStartup:value=>{state.failStartup=value},setWaiting:value=>{state.waiting=value},setChoice:value=>{state.choice=value},setClipboard:value=>{state.copied=value},getLastCopy:()=>state.copied,getLastApply:()=>state.lastApply,
  emitConnection:(connection,message='')=>{state.connection={...connection,stateRevision:state.revision};state.statusCallback?.({message,connection:state.connection,stateRevision:state.revision})},emitLegacy:message=>state.statusCallback?.(message),
  emitRemoval:(code,defer=false)=>{state.revision++;state.activeId=null;state.connection={code,autoStart:false,saved:false,stateRevision:state.revision};const update={removalRequested:true,stateRevision:state.revision,message:'Automatic restoration is off.',history:history(),connection:state.connection};if(defer)state.deferredRemoval=update;else state.statusCallback?.(update)},
  flushRemoval:()=>state.statusCallback?.(state.deferredRemoval),
  holdApplyResponse:()=>{state.applyResponseReady=false;state.applyResponsePending=new Promise(resolve=>{state.resolveApply=resolve})},applyResponseReady:()=>state.applyResponseReady,
  finishApplyResponse:()=>{state.resolveApply?.();state.applyResponsePending=null},
  holdCheck:()=>{state.checkPending=new Promise(resolve=>{state.resolveCheck=resolve})},finishCheck:()=>{state.resolveCheck?.();state.checkPending=null},
  holdSave:()=>{state.savePending=new Promise((resolve,reject)=>{state.resolveSave=resolve;state.rejectSave=reject})},
  finishSave:error=>{if(error)state.rejectSave(Error(error));else state.resolveSave();state.savePending=null}
};
window.prism={
  openProjectLink:async name=>{window.__fixture.link=name;if(name==='support')throw Error('The support page is not available yet.');return true},
  onQuitRequested:callback=>{window.__fixture.requestQuit=callback},
  quit:()=>{window.__fixture.quit=true},
  copy:async text=>{state.copied=text;return true},
  fonts:async()=>['Fixture Sans','Fixture Mono'],
  chooseImage:async area=>{await wait(30);if(state.choice==='cancel')return null;if(state.choice==='error')throw Error('fixture choice failed');return {image:state.choice==='large'?largePicture:picture,name:'fixture-'+area+'.png'}},
  openSettings:async()=>true,
  openTaskManager:async()=>{window.__fixture.taskManagerOpened=true;return {opened:true}},
  backgrounds:async()=>{await wait(25);return {...history(),active:state.profiles[0]}},
  loadBackground:async id=>{await wait(5);const profile=state.profiles.find(value=>value.id===id);if(!profile)throw Error('Unknown fixture background');return profile},
  applyWallpaper:async options=>{state.lastApply=options;await wait(60);if(state.failApply)throw Error('fixture apply failed');state.revision++;state.activeId='p0';state.connection=state.waiting?{code:'codex-open',detail:'',autoStart:true,saved:true}:{code:'applied',detail:'',autoStart:false,saved:true};state.connection.stateRevision=state.revision;const result={saved:true,installed:!state.waiting,stateRevision:state.revision,message:state.waiting?'Fixture Codex is open':'',history:history(),connection:state.connection,options};state.applyResponseReady=true;await state.applyResponsePending;return result},
  saveBackground:async()=>{window.__fixture.saves++;await state.savePending;return history()},
  removeWallpaper:async()=>{window.__fixture.removals++;await wait(10);return {removed:true,history:history(),connection:state.connection}},
  startWallpaper:async()=>{state.connection={code:'starting',detail:'',autoStart:false,saved:true};return {launched:true,connection:state.connection}},
  cancelBackgroundStart:async()=>{state.connection={code:'codex-open',detail:'',autoStart:false,saved:true,cancelled:true,stateRevision:++state.revision};return state.connection},
  checkBackgroundConnection:async()=>{const result={...state.connection};await state.checkPending;return result},
  setBackgroundStartup:async()=>{if(state.failStartup)throw Error('Fixture startup write denied');state.startupWarning='';return false},
  onBackgroundStatus:callback=>{state.statusCallback=callback;return()=>{state.statusCallback=null}}
};`;

let server;
let window;
let finished = false;
let timer;

function cleanupProfile() {
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Electron may still hold a cache lock during quit. */ }
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function serve(req, res) {
  const name = new URL(req.url, 'http://127.0.0.1').pathname.slice(1);
  if (name === '') {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
      .replace('<script type="module" src="app.mjs"></script>', '<script src="fixture.js"></script><script type="module" src="frontend-check.mjs"></script>');
    return send(res, 200, 'text/html; charset=utf-8', html);
  }
  if (name === 'fixture.js') return send(res, 200, 'text/javascript; charset=utf-8', fixture);
  if (name === 'frontend-check.mjs') return send(res, 200, 'text/javascript; charset=utf-8', fs.readFileSync(path.join(__dirname, 'frontend-check.mjs')));
  if (name.startsWith('assets/')) {
    const asset = path.resolve(root, name);
    if (!asset.startsWith(path.join(root, 'assets') + path.sep) || !fs.existsSync(asset)) return send(res, 404, 'text/plain', 'Not found');
    return send(res, 200, name.endsWith('.gif') ? 'image/gif' : 'image/png', fs.readFileSync(asset));
  }
  if (!new Set(['app.mjs', 'theme.mjs', 'wallpaper.mjs', 'style.css', 'icon.svg']).has(name)) return send(res, 404, 'text/plain', 'Not found');
  const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript';
  return send(res, 200, type, fs.readFileSync(path.join(root, name)));
}

async function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  if (error) {
    const message = error.stack || error.message || String(error);
    if (process.env.PRISM_FRONTEND_RESULT) fs.writeFileSync(process.env.PRISM_FRONTEND_RESULT, `FAIL: ${message}`);
    console.error(message);
    process.exitCode = 1;
  } else {
    if (process.env.PRISM_FRONTEND_RESULT) {
      fs.writeFileSync(process.env.PRISM_FRONTEND_RESULT, 'PASS: frontend smoke');
    }
    console.log('PASS: frontend smoke');
  }
  if (window && !window.isDestroyed()) window.destroy();
  if (server?.listening) {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
  app.quit();
}

async function checkEditorActionLayout() {
  for (const [width,height] of [[1040,760],[800,650]]) {
    window.setContentSize(width,height);
    const fits = await window.webContents.executeJavaScript(`(async () => {
      document.getElementById('show-themes').click();
      document.getElementById('theme-library-view').click();
      document.querySelector('[data-filter="all"]').click();
      document.getElementById('theme-page-prev').click();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      if (document.getElementById('theme-paging').hidden || document.getElementById('themes').children.length!==6) return false;
      const panel=document.querySelector('.control-panel').getBoundingClientRect();
      return ['save-open','copy'].every(id=>{const button=document.getElementById(id),box=button.getBoundingClientRect();return box.height>=32&&box.left>=panel.left&&box.right<=panel.right&&box.bottom<=panel.bottom-12&&button.scrollWidth<=button.clientWidth;});
    })()`);
    assert.ok(fits,`Save and Copy must fit below a full paginated theme page at ${width}x${height}`);
  }
}

async function checkRecoveryLayout() {
  await window.webContents.executeJavaScript(`(async () => {
    document.getElementById('show-backgrounds').click();
    window.__fixture.emitConnection({code:'codex-open',backgroundOnly:true,processIds:[412,413],mainProcessIds:[412],autoStart:true,saved:true});
    document.getElementById('connection-check').click();
    await new Promise(resolve=>setTimeout(resolve,0));
    document.getElementById('wallpaper-status').textContent='';
    document.getElementById('connection-recovery').click();
    await Promise.all(document.getElementById('connection-recovery-dialog').getAnimations().map(animation=>animation.finished));
  })()`);
  for (const [width,height] of [[1040,760],[800,650]]) {
    window.setContentSize(width,height);
    const fits = await window.webContents.executeJavaScript(`(async () => {
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const dialog=document.getElementById('connection-recovery-dialog'), box=dialog.getBoundingClientRect();
      return dialog.open && box.left>=0 && box.top>=0 && box.right<=innerWidth && box.bottom<=innerHeight && dialog.scrollWidth<=dialog.clientWidth;
    })()`);
    assert.ok(fits,`Recovery instructions must fit at ${width}x${height}`);
    if(process.env.PRISM_FRONTEND_EVIDENCE) {
      fs.mkdirSync(process.env.PRISM_FRONTEND_EVIDENCE,{recursive:true});
      fs.writeFileSync(path.join(process.env.PRISM_FRONTEND_EVIDENCE,`recovery-${width}.png`),(await window.webContents.capturePage(undefined, { stayHidden: true })).toPNG());
    }
  }
}

app.disableHardwareAcceleration();
app.setPath('userData', profile);
app.on('quit', cleanupProfile);
timer = setTimeout(() => finish(new Error('frontend smoke timed out')), 19_000);

server = http.createServer(serve);
server.listen(0, '127.0.0.1', async () => {
  try {
    await app.whenReady();
    window = new BrowserWindow({ show: false, skipTaskbar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    window.on('show', () => finish(new Error('The isolated test window must remain hidden')));
    window.webContents.on('console-message', (_event, ...args) => {
      const [detailsOrLevel, legacyMessage] = args;
      const message = typeof legacyMessage === 'string' ? legacyMessage : typeof detailsOrLevel === 'string' ? detailsOrLevel : detailsOrLevel?.message;
      if (!message) return;
      if (message.startsWith('PASS: frontend smoke')) checkEditorActionLayout().then(checkRecoveryLayout).then(() => import('./wallpaper-layout.mjs')).then(({ checkWallpaperLayout }) => checkWallpaperLayout(window)).then(() => finish(), finish);
      if (message.startsWith('FAIL:')) finish(new Error(message));
    });
    window.webContents.on('render-process-gone', (_event, details) => finish(new Error(`Renderer exited: ${details.reason}`)));
    await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
  } catch (error) { await finish(error); }
});
