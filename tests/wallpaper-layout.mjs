import assert from 'node:assert/strict';
import { wallpaperExpression, REMOVE_WALLPAPER } from '../wallpaper.mjs';

export async function checkWallpaperLayout(window) {
  // The two observed Codex layouts put the scroller behind or below the fixed header.
  await window.loadURL('data:text/html,' + encodeURIComponent(`<style>
    :root { --height-toolbar:46px; --app-shell-main-toolbar-height:0px; --frame-top:0px; --thread-content-top-inset:78px; --thread-sticky-header-top:32px; }
    body { margin:0; color:rgb(240,240,240); }
    main { position:fixed; inset:36px 0 0 100px; background:#111; border-top-left-radius:12.5px; }
    aside { position:fixed; inset:36px auto 0 0; width:100px; }
    header { position:fixed; top:36px; left:100px; right:0; height:46px; pointer-events:none; }
    header button { background:#111; color:white; pointer-events:auto; }
    [data-app-shell-header-toolbar] > .text-md { background:#28201c; }
    .thread-scroll-container { position:absolute; inset:var(--frame-top) 0 0; overflow:auto; }
    .message { height:1000px; }
    .bg-surface,[data-codex-xterm] { background:#28201c; }
    [class*="--app-shell-panel-background"] { background:var(--app-shell-panel-background,#28201c); }
    .border-l { border-left:1px solid #665544; }
    .border-t { border-top:1px solid #665544; }
    #side-panel { position:absolute; top:0; right:0; bottom:140px; width:140px; }
    #bottom-panel { position:absolute; left:0; right:0; bottom:0; height:139px; }
    #panel-chat,#panel-composer { position:static; height:0; background:#28201c; }
  </style><aside class="app-shell-left-panel"></aside><main class="main-surface">
  <header class="fixed top-toolbar-sm"><div data-app-shell-header-toolbar><div class="text-md"><button class="truncate" id="native-title">Task title</button></div></div><button id="other-title">Other</button></header>
  <div class="thread-scroll-container"><div class="message">Scrollable message</div></div>
  <div id="top-fade" class="_MainContentTopFade_fixture" style="pointer-events:none;position:fixed;top:36px;height:16px;background:linear-gradient(#28201c,transparent)"></div>
  <div id="composer-fade" aria-hidden="true" class="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-full bg-gradient-to-t from-surface via-surface" style="pointer-events:none;background-image:linear-gradient(to top,#28201c,#28201c,transparent)"></div>
  <div class="_ComposerLayoutRoot_fixture"><button id="send">Send</button></div>
  <div id="side-panel" class="absolute border-l bg-[var(--app-shell-panel-background,var(--color-surface))]"><div data-app-shell-tabs>
    <div id="panel-tabs" class="bg-[var(--app-shell-panel-background,var(--color-surface))]"><button style="background:#444" id="panel-button">Browser</button></div>
    <div class="bg-[var(--app-shell-panel-background,var(--color-surface))]"><div id="panel-welcome" class="bg-surface select-none"><div id="panel-sticky" class="sticky bg-surface">Tools</div></div></div>
  </div><div id="panel-chat" class="thread-scroll-container bg-token-main-surface-primary"></div><div id="panel-composer" class="_ComposerLayoutRoot_panel"></div></div>
  <div id="bottom-panel" class="absolute border-t bg-surface"><div><div data-app-shell-tabs><div class="bg-[var(--app-shell-panel-background,var(--color-surface))]"><div id="terminal" data-codex-xterm><span id="terminal-text" style="color:#11aa44;background:#222">Text</span></div></div></div></div></div></main>`));
  const image = 'data:image/png;base64,AA==';
  for (const mode of ['span', 'duplicate', 'separate', 'chat', 'sidebar']) {
    await window.webContents.executeJavaScript(wallpaperExpression({ image, sidebarImage:'data:image/png;base64,AQ==',rightImage:'data:image/png;base64,Ag==',terminalImage:'data:image/png;base64,Aw==',veil:.58,sidebarVeil:.73,rightVeil:.49,terminalVeil:.91,rightEnabled:true,terminalEnabled:true,mode }));
    for (const inset of [0, 47]) {
      const result = await window.webContents.executeJavaScript(`(() => {
        document.documentElement.style.setProperty('--frame-top','${inset}px');
        document.documentElement.style.setProperty('--thread-content-top-inset','${inset ? 32 : 78}px');
        const scroller=document.querySelector('.thread-scroll-container'); scroller.scrollTop=100;
        return { header:getComputedStyle(document.querySelector('header')).backgroundColor,
           title:getComputedStyle(document.querySelector('#native-title')).backgroundColor,
           otherTitle:getComputedStyle(document.querySelector('#other-title')).backgroundColor,
          fade:getComputedStyle(document.querySelector('#composer-fade')).opacity,
          topFade:getComputedStyle(document.querySelector('#top-fade')).opacity,
          titleWrapper:getComputedStyle(document.querySelector('[data-app-shell-header-toolbar] > .text-md')).backgroundColor,
          corner:getComputedStyle(document.querySelector('main')).borderTopLeftRadius,
          gradient:getComputedStyle(document.querySelector('#composer-fade')).backgroundImage,
          send:getComputedStyle(document.querySelector('#send')).opacity,
          clipped:document.elementFromPoint(400,60)?.className,
          message:document.elementFromPoint(400,100)?.className,
          clip:getComputedStyle(scroller).clipPath };
      })()`);
      assert.equal(result.header, 'rgba(0, 0, 0, 0)');
      assert.equal(result.title, mode === 'sidebar' ? 'rgb(17, 17, 17)' : 'rgb(15, 15, 20)');
      assert.equal(result.otherTitle, 'rgb(17, 17, 17)');
      assert.equal(result.fade, mode === 'sidebar' ? '1' : '0.12');
      assert.equal(result.topFade, mode === 'sidebar' ? '1' : '0', 'the separate native top fade must not leave a band over chat wallpaper');
      assert.equal(result.corner, mode === 'sidebar' ? '12.5px' : '0px', 'the chat corner must not expose the unfaded wallpaper below its tint');
      assert.equal(result.titleWrapper, mode === 'sidebar' ? 'rgb(40, 32, 28)' : 'rgba(0, 0, 0, 0)', 'clear the native square wrapper while preserving the rounded title button');
      assert.match(result.gradient, /linear-gradient/, 'retain the native gradient shape');
      assert.equal(result.send, '1', 'do not fade the composer controls');
      assert.equal(result.message, 'message', 'content below the toolbar must stay visible and interactive');
      if (mode !== 'sidebar') assert.notEqual(result.clipped, 'message', 'scrolling chat must not paint through the transparent header');
      else assert.equal(result.clip, 'none', 'sidebar-only must not change chat clipping');
    }
    const panels = await window.webContents.executeJavaScript(`(() => {
      const css=id=>getComputedStyle(document.getElementById(id));
      return {side:css('side-panel').backgroundImage,bottom:css('bottom-panel').backgroundImage,leftBorder:css('side-panel').borderLeft,topBorder:css('bottom-panel').borderTop,
        surfaces:['panel-tabs','panel-welcome','panel-sticky','terminal'].map(id=>css(id).backgroundColor),button:css('panel-button').backgroundColor,text:[css('terminal-text').color,css('terminal-text').backgroundColor,css('terminal-text').opacity]};
    })()`);
    for (const area of ['side','bottom']) assert.equal(panels[area].includes('linear-gradient'), mode !== 'chat', `${area} must follow sidebar wallpaper mode`);
    if (mode !== 'chat') {
      assert.ok(panels.side.includes('0.49'), 'right panel uses its own fading');
      assert.ok(panels.bottom.includes('0.91'), 'terminal uses its own fading');
    }
    if (mode === 'separate') {
      assert.ok(panels.side.includes('base64,Ag=='), 'right panel uses its own image');
      assert.ok(panels.bottom.includes('base64,Aw=='), 'terminal uses its own image');
    }
    assert.equal(panels.leftBorder, '1px solid rgb(102, 85, 68)');
    assert.equal(panels.topBorder, '1px solid rgb(102, 85, 68)');
    for (const surface of panels.surfaces) assert.equal(surface, mode === 'chat' ? 'rgb(40, 32, 28)' : 'rgba(0, 0, 0, 0)');
    assert.equal(panels.button, 'rgb(68, 68, 68)', 'panel buttons retain their background');
    assert.deepEqual(panels.text, ['rgb(17, 170, 68)','rgb(34, 34, 34)','1'], 'terminal text and explicit cell colors remain intact');
  }
  await window.webContents.executeJavaScript(REMOVE_WALLPAPER);
  assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.thread-scroll-container')).clipPath`), 'none');
  assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#composer-fade')).opacity`), '1');
  assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#terminal')).backgroundColor`), 'rgb(40, 32, 28)');

  for (const [rightEnabled,terminalEnabled] of [[undefined,undefined],[true,false],[false,true],[true,true],[false,false]]) {
    await window.webContents.executeJavaScript(wallpaperExpression({image,veil:.75,sidebarVeil:.85,mode:'span',rightEnabled,terminalEnabled,clearText:true}));
    const result=await window.webContents.executeJavaScript(`(() => {
      const css=id=>getComputedStyle(document.getElementById(id));
      return {right:css('side-panel').backgroundImage,terminal:css('bottom-panel').backgroundImage,rightColor:css('side-panel').backgroundColor,terminalColor:css('bottom-panel').backgroundColor,rightShadow:css('side-panel').textShadow,terminalShadow:css('bottom-panel').textShadow,terminalInner:css('terminal').backgroundColor,rightInner:css('panel-welcome').backgroundColor,sideChat:css('panel-chat').backgroundColor,sideClip:css('panel-chat').clipPath,sideComposer:css('panel-composer').backgroundColor};
    })()`);
    for(const [area,enabled] of [['right',!!rightEnabled],['terminal',!!terminalEnabled]]) {
      assert.equal(result[area].includes('linear-gradient'),enabled,`${area} wallpaper requires an explicit opt-in`);
      assert.equal(result[`${area}Shadow`]==='none',!enabled,`${area} must not inherit chat outline while off`);
      if(!enabled)assert.equal(result[`${area}Color`],'rgb(40, 32, 28)',`${area} native background is preserved`);
      assert.equal(result[`${area}Inner`],enabled?'rgba(0, 0, 0, 0)':'rgb(40, 32, 28)',`${area} inner surface follows its own choice`);
    }
    assert.equal(result.sideChat,rightEnabled?'rgba(0, 0, 0, 0)':'rgb(40, 32, 28)','unselected side chat keeps its background');
    assert.equal(result.sideComposer,rightEnabled?'rgba(15, 15, 20, 0.92)':'rgb(40, 32, 28)','unselected side composer stays native');
    if(!rightEnabled)assert.equal(result.sideClip,'none','unselected side chat is not clipped by main chat rules');
  }

  // All four panes remain independent, including nested right/terminal without chat.
  for (let mask = 1; mask < 16; mask++) {
    const [chatEnabled, sidebarEnabled, rightEnabled, terminalEnabled] = [0,1,2,3].map(bit => !!(mask & (1 << bit)));
    await window.webContents.executeJavaScript(wallpaperExpression({image,veil:.75,sidebarVeil:.85,mode:'span',chatEnabled,sidebarEnabled,rightEnabled,terminalEnabled,clearText:true}));
    const result=await window.webContents.executeJavaScript(`(() => {
      const css=selector=>getComputedStyle(document.querySelector(selector));
      return {panes:['main.main-surface','aside.app-shell-left-panel','#side-panel','#bottom-panel'].map(s=>({image:css(s).backgroundImage,shadow:css(s).textShadow})),sideChat:css('#panel-chat').backgroundColor,sideComposer:css('#panel-composer').backgroundColor,sideClip:css('#panel-chat').clipPath,body:css('body').backgroundImage,layer:css('#prism-wallpaper-layer').backgroundImage};
    })()`);
    for (const [index,enabled] of [chatEnabled,sidebarEnabled,rightEnabled,terminalEnabled].entries()) {
      assert.equal(result.panes[index].image.includes('linear-gradient'),enabled,`${mask}: pane ${index} image choice`);
      assert.equal(result.panes[index].shadow !== 'none',enabled,`${mask}: pane ${index} outline choice`);
    }
    assert.equal(result.sideChat,rightEnabled?'rgba(0, 0, 0, 0)':'rgb(40, 32, 28)');
    assert.equal(result.sideComposer,rightEnabled?'rgba(15, 15, 20, 0.92)':'rgb(40, 32, 28)');
    assert.equal(result.sideClip,'none','main chat clipping must not change a separate panel');
    assert.equal(result.layer,'none','unselected transparent native surfaces must not reveal a global image');
  }

  // Native right/terminal panels are children of main. Check painted pixels, not just their declared gradients.
  for (const [width,height,alpha,chatFade,panelFade,large,rightEnabled=true,terminalEnabled=true] of [[800,600,1,.75,.85],[980,680,1,.75,.85],[800,600,.5,1,.4],[800,600,1,.75,.85,true],[800,600,1,.75,.85,false,true,false],[800,600,1,.75,.85,false,false,true],[800,600,1,.75,.85,false,false,false]]) {
    window.setContentSize(width,height);
    const sample = await window.webContents.executeJavaScript(`(() => {
      const canvas=document.createElement('canvas');canvas.width=innerWidth;canvas.height=innerHeight;
      const context=canvas.getContext('2d'),gradient=context.createLinearGradient(0,0,innerWidth,innerHeight);
      gradient.addColorStop(0,'rgba(240,240,240,${alpha})');gradient.addColorStop(1,'rgba(120,120,120,${alpha})');context.fillStyle=gradient;context.fillRect(0,0,innerWidth,innerHeight);
      const points=[['left',50,200],['chat',200,200],['right',innerWidth-50,200],['terminal',200,innerHeight-50]].map(([area,x,y])=>({area,x,y,rgba:[...context.getImageData(x,y,1,1).data]}));
      return {image:canvas.toDataURL(),width:innerWidth,height:innerHeight,points};
    })()`);
    // PNG permits trailing data. Keep the same pixels while exceeding Chromium's 2 MiB CSS-variable limit.
    if (large) sample.image='data:image/png;base64,'+Buffer.concat([Buffer.from(sample.image.split(',')[1],'base64'),Buffer.alloc(2*1024*1024)]).toString('base64');
    await window.webContents.executeJavaScript(wallpaperExpression({image:sample.image,veil:chatFade,sidebarVeil:panelFade,rightEnabled,terminalEnabled,mode:'span'}));
    await window.webContents.executeJavaScript(`(async () => {const image=new Image();image.src=${JSON.stringify(sample.image)};await image.decode();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()`);
    const capture=await window.webContents.capturePage(undefined, { stayHidden: true }), bitmap=capture.toBitmap(), size=capture.getSize();
    for (const {area,x,y,rgba} of sample.points) {
      const enabled=area==='right'?rightEnabled:area==='terminal'?terminalEnabled:true;
      const fade=area==='chat'?chatFade:panelFade, base=rgba[1]*(rgba[3]/255)+15*(1-rgba[3]/255), expected=enabled?Math.round(base*(1-fade)+15*fade):32;
      const actual=bitmap[(Math.floor(y*size.height/sample.height)*size.width+Math.floor(x*size.width/sample.width))*4+1];
      assert.ok(Math.abs(actual-expected)<=2, `${area} painted fading must match its own setting at ${width}x${height}: expected green ${expected}, got ${actual}`);
    }
  }
  // Codex 26.903.8094.0 paints the home Body; its utility-bar Root deliberately has no radius.
  await window.loadURL('data:text/html,' + encodeURIComponent(`<style>
    body { margin:0; } main { position:fixed; inset:0; color:rgb(240,240,240); }
    ._ComposerLayoutRoot_fixture { position:absolute;left:40px;top:40px;width:300px;height:140px; }
    ._ComposerLayoutRoot_fixture:not([data-composer-utility-bar-variant=home]), ._ComposerLayoutBody_fixture { background:rgb(40,32,28);border-radius:24px; }
    ._ComposerLayoutBody_fixture { position:absolute;inset:30px 0 0; }
    [data-single-line=true] ._ComposerLayoutBody_fixture { border-radius:9999px; }
    button { margin:35px; background:rgb(220,220,220);border-radius:50%; }
    #panel { position:absolute;left:400px;top:0;width:380px;height:240px;background:#28201c; }
    #thread { top:230px;height:90px; }
  </style><main class="main-surface"><div id="home" class="_ComposerLayoutRoot_fixture" data-composer-utility-bar-variant="home"><div class="_ComposerLayoutBody_fixture"><button id="home-send">Send</button></div></div><div id="thread" class="_ComposerLayoutRoot_fixture"><button>Send</button></div><div id="panel" class="absolute bg-[var(--app-shell-panel-background)]"><div id="panel-home" class="_ComposerLayoutRoot_fixture" data-composer-utility-bar-variant="home"><div class="_ComposerLayoutBody_fixture"><button>Send</button></div></div></div></main>`));
  const white = await window.webContents.executeJavaScript(`(() => {const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,2,2);return canvas.toDataURL();})()`);
  for (const [chatEnabled,rightEnabled,single] of [[true,false,false],[true,true,true],[false,true,false]]) {
    await window.webContents.executeJavaScript(`document.getElementById('home').dataset.singleLine='${single}'`);
    await window.webContents.executeJavaScript(wallpaperExpression({image:white,veil:.5,sidebarEnabled:false,chatEnabled,rightEnabled,mode:'span'}));
    const result = await window.webContents.executeJavaScript(`(() => {const css=s=>getComputedStyle(document.querySelector(s));return {root:css('#home').backgroundColor,body:css('#home > div').backgroundColor,radius:css('#home > div').borderRadius,thread:css('#thread').backgroundColor,panelRoot:css('#panel-home').backgroundColor,panelBody:css('#panel-home > div').backgroundColor,button:css('#home-send').backgroundColor};})()`);
    assert.equal(result.root,'rgba(0, 0, 0, 0)','new-chat utility wrapper must stay transparent at every rounded corner');
    assert.equal(result.panelRoot,'rgba(0, 0, 0, 0)','side-chat home wrapper must also stay transparent');
    assert.equal(result.body,chatEnabled?'rgba(15, 15, 20, 0.92)':'rgb(40, 32, 28)');
    assert.equal(result.panelBody,rightEnabled?'rgba(15, 15, 20, 0.92)':'rgb(40, 32, 28)');
    assert.equal(result.thread,chatEnabled?'rgba(15, 15, 20, 0.92)':'rgb(40, 32, 28)','existing task composers keep their surface');
    assert.equal(result.radius,single?'9999px':'24px'); assert.equal(result.button,'rgb(220, 220, 220)');
    if(chatEnabled) {
      await window.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify(white)};await image.decode();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
      const capture=await window.webContents.capturePage(undefined, { stayHidden: true }),bitmap=capture.toBitmap(),size=capture.getSize();
      const viewport=await window.webContents.executeJavaScript('({width:innerWidth,height:innerHeight})');
      for(const [x,y] of [[42,72],[337,72],[42,177],[337,177]]) {
        const green=bitmap[(Math.floor(y*size.height/viewport.height)*size.width+Math.floor(x*size.width/viewport.width))*4+1];
        assert.ok(Math.abs(green-135)<=2,`new-chat corner must show the wallpaper's own fade, got ${green}`);
      }
    }
  }
}
