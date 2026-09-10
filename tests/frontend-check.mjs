import './app.mjs';

const $ = id => document.getElementById(id);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function waitFor(predicate, message, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (predicate()) return; await tick(); }
  throw new Error(message);
}
const chooseLayout = mode => document.querySelector(`input[name=layout][value="${mode}"]`).click();
const visibleCopy = () => document.body.innerText;

try {
  assert($('wallpaper-apply').disabled, 'Apply must start disabled while backgrounds are loading');
  assert($('connection-title').textContent === 'Checking Codex connection…' && $('connection-panel').dataset.state === 'checking', 'connection setup must begin with a visible checking state');
  assert($('wallpaper-veil').value === '75' && document.querySelector('input[name=layout]:checked').value === 'span', 'new setups should start at 75% chat fading with one image across selected areas');
  for (const id of ['sidebar-veil', 'right-veil', 'terminal-veil']) assert($(id).value === '85', `new setups should default ${id} fading to 85%`);
  for (const id of ['right-enabled', 'terminal-enabled']) assert(!$(id).checked && $(id).disabled, `${id} must start off and wait for saved settings to load`);
  assert($('reset-fading').disabled, 'fading reset must wait for saved settings to load');
  $('wallpaper-veil').value = '70'; $('wallpaper-veil').dispatchEvent(new Event('input', { bubbles: true }));
  for (const id of ['sidebar-veil', 'right-veil', 'terminal-veil']) assert($(id).value === '80', `linked ${id} fading should stay 10 points above chat fading`);
  $('sidebar-veil').value = '61'; $('sidebar-veil').dispatchEvent(new Event('input', { bubbles: true }));
  $('wallpaper-veil').value = '75'; $('wallpaper-veil').dispatchEvent(new Event('input', { bubbles: true }));
  assert($('sidebar-veil').value === '61' && $('right-veil').value === '85' && $('terminal-veil').value === '85', 'changing left sidebar fading must leave the other panels linked');
  $('right-veil').value = '62'; $('right-veil').dispatchEvent(new Event('input', { bubbles: true }));
  $('wallpaper-veil').value = '80'; $('wallpaper-veil').dispatchEvent(new Event('input', { bubbles: true }));
  assert($('sidebar-veil').value === '61' && $('right-veil').value === '62' && $('terminal-veil').value === '90', 'changing right panel fading must leave terminal linked');
  $('terminal-veil').value = '63'; $('terminal-veil').dispatchEvent(new Event('input', { bubbles: true }));
  $('wallpaper-veil').value = '90'; $('wallpaper-veil').dispatchEvent(new Event('input', { bubbles: true }));
  assert($('sidebar-veil').value === '61', 'manual sidebar fading should stop linked updates');
  assert($('right-veil').value === '62', 'manual right panel fading should stop linked updates');
  assert($('terminal-veil').value === '63', 'manual terminal fading should stop linked updates');
  await waitFor(() => $('background-history-list').children.length === 4, 'background history did not load four visible entries');
  assert(!$('wallpaper-apply').disabled && $('background-startup').indeterminate && $('wallpaper-status').textContent.includes('Fixture startup registry denied'), 'unreadable startup status must warn without blocking saved background use');
  window.__fixture.setFailStartup(true); $('background-startup').click();
  await waitFor(() => !$('background-startup').disabled, 'failed startup toggle did not finish');
  assert($('background-startup').indeterminate && $('background-startup').title.includes('Fixture startup registry denied'), 'failed startup toggle must preserve the unknown state and explanation');
  window.__fixture.setFailStartup(false);
  window.__fixture.emitConnection({ code:'ready', detail:'', autoStart:false, saved:false });
  const previewInk = () => $('preview').style.getPropertyValue('--ink');
  assert(previewInk() === '#F0F0F0', 'background preview must start with light text independently of the default Paper theme');
  const nav = document.querySelector('.studio-nav'), navBefore = nav.getBoundingClientRect();
  assert(navBefore.left - document.querySelector('.brand').getBoundingClientRect().right <= 16, 'section navigation must stay beside the brand');
  $('show-themes').click();
  assert(nav.getBoundingClientRect().left === navBefore.left && nav.getBoundingClientRect().width === navBefore.width, 'Import theme must not move or resize the section navigation');
  assert(previewInk() === '#292C35', 'Themes must still preview the selected light palette');
  window.__fixture.emitConnection({ code:'applied', appearance:'rgb(255, 255, 255)' });
  assert(previewInk() === '#292C35', 'Codex appearance updates must not overwrite the Themes preview');
  $('show-backgrounds').click();
  assert(nav.getBoundingClientRect().left === navBefore.left && previewInk() === '#FFFFFF', 'Backgrounds must restore the Codex text color without moving navigation');
  assert($('preview').style.getPropertyValue('--surface') === '#0F0F14', 'dark Codex fading must match the wallpaper adapter');
  window.__fixture.emitConnection({ code:'applied', appearance:'rgb(30, 30, 30)' });
  assert(previewInk() === '#1E1E1E' && $('preview').style.getPropertyValue('--surface') === '#F6F6F8', 'light Codex must use dark text and the matching light fade');
  for (const appearance of [null, {}, 'rgb(999, 0, 0)', 'url(https://example.com)', 'red']) {
    window.__fixture.emitConnection({ code:'ready', appearance });
    assert(previewInk() === '#1E1E1E', 'missing or malformed appearance must preserve the last known preview color');
  }
  window.__fixture.emitConnection({ code:'ready', appearance:'rgb(255, 255, 255)' });
  assert(getComputedStyle($('wallpaper-start')).backgroundColor === 'rgb(238, 232, 246)', 'Open Codex must have a visible soft accent background');
  window.__fixture.emitConnection({ code:'codex-closed', saved:true });
  const openCue = getComputedStyle($('wallpaper-start'), '::after');
  assert(openCue.animationName === 'open-codex-pulse' && openCue.animationIterationCount === '2', 'closed Codex must receive a bounded opening cue');
  window.__fixture.emitConnection({ code:'ready', appearance:'rgb(255, 255, 255)' });
  assert(getComputedStyle($('wallpaper-start'), '::after').animationName === 'none', 'opening cue must stop once Codex is ready');
  assert($('connection-title').textContent === 'Ready to apply' && $('connection-description').textContent.includes('Choose an image'), 'ready state must give the next Apply step');
  window.__fixture.emitLegacy('Legacy connection status');
  assert($('background-connection').textContent === 'Legacy connection status', 'legacy string background status must remain visible');
  $('github-open').click(); await tick();
  assert(window.__fixture.link === 'github' && $('status').textContent === 'GitHub opened in your browser.', 'GitHub must use the desktop link bridge');
  $('support-open').click(); await tick();
  assert(window.__fixture.link === 'support' && $('status').textContent === 'The support page is not available yet.' && $('status').classList.contains('error'), 'Support failures must remain visible');
  for (const [id, surface] of Object.entries({ 'github-open': 'rgb(36, 41, 47)', 'support-open': 'rgb(255, 221, 0)' })) {
    const button = $(id), box = button.getBoundingClientRect(), icon = button.querySelector('svg');
    assert(icon?.getAttribute('aria-hidden') === 'true' && icon.getAttribute('focusable') === 'false', `${id} must have a decorative inline icon`);
    assert(getComputedStyle(button).backgroundColor === surface, `${id} must have its highlighted color surface`);
    assert(box.width > 70 && box.height >= 32 && box.left >= 0 && box.right <= innerWidth, `${id} must be visible in the header`);
  }
  assert(document.querySelector('.studio-nav').getBoundingClientRect().right <= document.querySelector('.top-actions').getBoundingClientRect().left, 'header actions must not overlap section navigation');
  assert(document.querySelector('.theme-controls').dataset.view === 'library' && $('theme-library-view').getAttribute('aria-pressed') === 'true', 'theme library must be the initial compact view');
  $('theme-editor-view').click();
  assert(document.querySelector('.theme-controls').dataset.view === 'editor' && $('theme-editor-view').getAttribute('aria-pressed') === 'true' && $('theme-library-view').getAttribute('aria-pressed') === 'false', 'Edit must show the theme editor and update its pressed state');
  $('theme-library-view').click();
  assert(document.querySelector('.theme-controls').dataset.view === 'library', 'Library must restore the theme list');
  const advancedOpen = document.querySelector('[data-open="advanced-dialog"]');
  advancedOpen.click();
  assert($('advanced-dialog').open, 'generic dialog trigger must open its target');
  document.querySelector('[data-close="advanced-dialog"]').click();
  assert(!$('advanced-dialog').open, 'dialog close control must close its target');
  assert($('themes').children.length === 6 && $('theme-paging').hidden, 'six themes must fit on one page');
  for (const name of ['Smoke saved one', 'Smoke saved two']) {
    $('save-open').click(); $('save-name').value = name; $('save-form').requestSubmit();
    await waitFor(() => !$('save-dialog').open, `${name} did not save`);
  }
  assert($('theme-page-label').textContent === '2 / 2' && $('themes').children.length === 2 && $('theme-page-next').disabled && !$('theme-page-prev').disabled, 'saving must reveal the selected theme on the clamped second page');
  $('theme-page-prev').click();
  assert($('theme-page-label').textContent === '1 / 2' && $('themes').children.length === 6, 'previous must show the first six themes');
  $('search').value = 'Smoke saved'; $('search').dispatchEvent(new Event('input', { bubbles: true }));
  assert($('theme-page-label').textContent === '1 / 1' && $('themes').children.length === 2 && $('theme-paging').hidden, 'search must reset paging and show matching saved themes');
  $('search').value = ''; $('search').dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-filter="saved"]').click();
  assert($('theme-page-label').textContent === '1 / 1' && $('themes').children.length === 2, 'saved filter must reset paging');
  document.querySelector('[data-filter="all"]').click();
  document.querySelector('.theme-choice').click();
  assert(document.querySelector('.theme-controls').dataset.view === 'library', 'choosing a theme must keep the library visible for comparison');
  $('theme-library-view').click();
  assert(!/save a copy|new perspective|feels right|your background/i.test(visibleCopy()), 'visible UI must avoid promotional filler');
  assert($('wallpaper-veil').value === '85', 'active profile should restore saved chat fading');
  assert($('sidebar-veil').value === '70', 'profiles without sidebar linking should preserve saved sidebar fading');
  assert($('right-veil').value === '70' && $('terminal-veil').value === '70', 'legacy profiles should inherit left sidebar fading');
  assert(!$('right-enabled').checked && !$('terminal-enabled').checked, 'legacy profiles must leave right panel and terminal wallpaper off');
  assert($('chat-enabled').checked && !$('sidebar-enabled').checked && !$('right-enabled').disabled && !$('terminal-enabled').disabled, 'legacy Chat only must restore selection without preventing independent pane choices');
  assert(document.querySelector('input[name=layout]:checked').value === 'duplicate', 'legacy single-pane image fitting must be preserved');
  assert([...document.querySelectorAll('.history-choice small')].every(detail => detail.textContent.includes('Right off') && detail.textContent.includes('Terminal off')), 'legacy history must describe optional panels as off');
  assert(![...document.querySelectorAll('.wallpaper-controls output')].some(output => output.textContent.includes('NaN')), 'legacy profile fading must stay numeric');
  chooseLayout('separate');
  assert(!$('wallpaper-apply').disabled, 'Separate with Chat alone must not require an unchecked panel image');
  $('sidebar-enabled').click();
  assert(!$('right-enabled').disabled && !$('terminal-enabled').disabled, 'panel opt-ins must be available when the layout permits panels');
  assert(!$('choose-image').hidden && !$('choose-sidebar-image').hidden && $('choose-right-image').hidden && $('choose-terminal-image').hidden, 'separate mode must only show image pickers for selected areas');
  $('wallpaper-veil').value = '76'; $('wallpaper-veil').dispatchEvent(new Event('input', { bubbles: true }));
  $('sidebar-veil').value = '86'; $('sidebar-veil').dispatchEvent(new Event('input', { bubbles: true }));
  assert(!$('right-enabled').checked && !$('terminal-enabled').checked, 'chat and left fading changes must not opt into optional panels');
  $('reset-fading').click();
  assert(!$('right-enabled').checked && !$('terminal-enabled').checked, 'Reset fading must not opt into optional panels');
  $('choose-image').click();
  assert($('wallpaper-apply').disabled && $('right-enabled').disabled && $('terminal-enabled').disabled && document.querySelector('.history-choice').disabled, 'image selection must lock Apply, panel opt-ins and history before the picker resolves');
  await waitFor(() => !$('image-thumbnail').hidden && !$('choose-image').disabled, 'chat image was not selected');
  assert(!$('right-enabled').checked && !$('terminal-enabled').checked, 'choosing the shared image must not opt into optional panels');
  $('right-enabled').click();
  assert(!$('right-fade').hidden && !$('choose-right-image').hidden && $('terminal-fade').hidden && $('choose-terminal-image').hidden, 'right panel opt-in must only reveal right panel controls');
  assert($('wallpaper-apply').disabled, 'separate mode must wait for its sidebar image');
  $('chat-enabled').click(); $('sidebar-enabled').click();
  $('choose-right-image').click();
  await waitFor(() => !$('choose-right-image').disabled, 'right-only image selection must finish');
  assert(!$('wallpaper-apply').disabled && document.querySelector('.mock-panel').style.background.includes('--right-image'), 'Right alone must preview and save its own image without a shared panel image');
  $('chat-enabled').click(); $('sidebar-enabled').click();
  assert($('wallpaper-apply').disabled, 'Selecting the empty left sidebar must require its image');
  $('choose-sidebar-image').click();
  await waitFor(() => !$('sidebar-image-thumbnail').hidden, 'sidebar image was not selected');
  assert(!$('wallpaper-apply').disabled, 'separate mode should apply after both images are selected');
  window.__fixture.holdSave();
  $('wallpaper-save').click(); $('background-save-name').value = 'Smoke background'; $('background-save-form').requestSubmit();
  const saveButton = $('background-save-form').querySelector('[type=submit]');
  assert(saveButton.disabled && $('wallpaper-apply').disabled && $('choose-image').disabled && $('right-enabled').disabled && document.querySelector('.history-choice').disabled, 'pending named saves must lock the whole background draft');
  $('background-save-form').requestSubmit();
  assert(window.__fixture.saves === 1, 'repeated submit must not start another background save');
  document.querySelector('[data-close="background-save-dialog"]').click();
  assert(!$('background-save-dialog').open && $('wallpaper-save').disabled && $('wallpaper-veil').disabled, 'closing a pending save must keep conflicting operations locked');
  window.__fixture.finishSave();
  await waitFor(() => !$('wallpaper-save').disabled && !saveButton.disabled, 'saved background must unlock controls');
  assert($('wallpaper-status').textContent === 'Background saved. Load it from History. Fixture startup registry denied', 'a committed save must succeed and retain the optional startup warning');
  const beforeFailedSave = $('right-image-thumbnail').src;
  window.__fixture.holdSave();
  $('wallpaper-save').click(); $('background-save-name').value = 'Failed save'; $('background-save-form').requestSubmit();
  document.querySelector('[data-close="background-save-dialog"]').click();
  window.__fixture.finishSave('fixture save failed');
  await waitFor(() => !$('wallpaper-save').disabled && !saveButton.disabled, 'failed background save must unlock controls');
  assert($('wallpaper-status').textContent.includes('fixture save failed') && $('wallpaper-status').classList.contains('error'), 'a save failure must remain visible even after its dialog closes');
  assert($('right-image-thumbnail').src === beforeFailedSave && !$('wallpaper-apply').disabled, 'failed saves must preserve the selected images and usable draft');
  assert(document.querySelector('.mock-panel').style.background.includes('--right-image') && document.querySelector('.mock-terminal').style.background === '', 'the enabled right panel must retain its own image');
  const sidebarVariable = $('preview').style.getPropertyValue('--sidebar-image');
  $('choose-right-image').click();
  await waitFor(() => !$('choose-right-image').disabled && !$('right-image-thumbnail').hidden, 'right panel image was not selected');
  assert($('preview').style.getPropertyValue('--sidebar-image') === sidebarVariable && $('preview').style.getPropertyValue('--terminal-image') === 'none', 'right selection must update only the right panel image');
  $('terminal-enabled').click();
  assert(!$('terminal-fade').hidden && !$('choose-terminal-image').hidden && document.querySelector('.mock-terminal').style.background.includes('--sidebar-image'), 'terminal opt-in must reveal its controls and use the left image fallback');
  $('choose-terminal-image').click();
  await waitFor(() => !$('choose-terminal-image').disabled && !$('terminal-image-thumbnail').hidden, 'terminal image was not selected');
  assert($('preview').style.getPropertyValue('--sidebar-image') === sidebarVariable, 'terminal selection must not replace the left sidebar image');
  const rightPicture = $('right-image-thumbnail').src, terminalPicture = $('terminal-image-thumbnail').src;
  $('right-enabled').click();
  assert(document.querySelector('.mock-panel').style.background === '' && document.querySelector('.mock-terminal').style.background.includes('--terminal-image') && $('right-fade').hidden, 'turning off right wallpaper must leave terminal wallpaper on');
  $('right-enabled').click(); $('terminal-enabled').click();
  assert(document.querySelector('.mock-panel').style.background.includes('--right-image') && document.querySelector('.mock-terminal').style.background === '' && $('terminal-fade').hidden, 'turning off terminal wallpaper must leave right wallpaper on');
  $('terminal-enabled').click();
  assert($('right-image-thumbnail').src === rightPicture && $('terminal-image-thumbnail').src === terminalPicture, 'panel opt-ins must preserve previously selected images');
  window.__fixture.setChoice('large');
  $('choose-image').click();
  await waitFor(() => !$('choose-image').disabled, 'large image selection did not finish');
  await $('image-thumbnail').decode();
  assert($('image-thumbnail').naturalWidth > 0 && $('image-thumbnail').naturalHeight > 0, 'large selected image must decode');
  $('choose-sidebar-image').click();
  await waitFor(() => !$('choose-sidebar-image').disabled && !$('sidebar-image-thumbnail').hidden, 'large sidebar image selection did not finish');
  await $('sidebar-image-thumbnail').decode();
  assert($('sidebar-image-thumbnail').naturalWidth > 0 && $('sidebar-image-thumbnail').naturalHeight > 0, 'large selected sidebar image must decode');
  $('choose-right-image').click();
  await waitFor(() => !$('choose-right-image').disabled, 'large right panel image selection did not finish');
  $('choose-terminal-image').click();
  await waitFor(() => !$('choose-terminal-image').disabled, 'large terminal image selection did not finish');
  for (const variable of ['--chat-image', '--sidebar-image', '--right-image', '--terminal-image']) {
    const cssImage = $('preview').style.getPropertyValue(variable).trim();
    assert(/^url\("blob:/.test(cssImage) && cssImage.length < 256, `${variable} must use a short blob URL CSS variable`);
  }
  $('clear-text').checked = true; $('clear-text').dispatchEvent(new Event('input', { bubbles: true }));
  const layoutExpectations = {
    span: { root: true, chat: null, sidebar: null, panel: null, terminal: null },
    duplicate: { root: false, chat: '--chat-image', sidebar: '--chat-image', panel: '--chat-image', terminal: '--chat-image' },
    separate: { root: false, chat: '--chat-image', sidebar: '--sidebar-image', panel: '--right-image', terminal: '--terminal-image' }
  };
  for (const [mode, expected] of Object.entries(layoutExpectations)) {
    chooseLayout(mode);
    await tick();
    assert($('right-enabled').checked && $('terminal-enabled').checked, `${mode} must retain optional panel choices`);
    assert(!$('right-enabled').disabled && !$('terminal-enabled').disabled, `${mode} pane controls must remain independent`);
    for (const id of ['chat-fade', 'sidebar-fade', 'right-fade', 'terminal-fade']) assert(!$(id).hidden, `${mode} ${id} visibility mismatch`);
    assert($('preview').style.background.includes('var(--chat-image)') === expected.root, `${mode} layout root image mismatch`);
    for (const [pane, variable] of [['chat', expected.chat], ['sidebar', expected.sidebar], ['panel', expected.panel], ['terminal', expected.terminal]]) {
      const actual = document.querySelector(`.mock-${pane}`).style.background;
      assert(actual.includes(variable || '__no-image__') === !!variable, `${mode} layout ${pane} image mismatch`);
    }
    assert(getComputedStyle(document.querySelector('.mock-chat')).textShadow !== 'none', `${mode} chat outline mismatch`);
    assert(getComputedStyle(document.querySelector('.mock-terminal')).textShadow !== 'none', `${mode} terminal outline mismatch`);
  }
  // Every pane combination is independent, including right/terminal without chat or left.
  chooseLayout('span');
  for (let mask = 0; mask < 16; mask++) {
    for (const [index, area] of ['chat', 'sidebar', 'right', 'terminal'].entries()) {
      const enabled = !!(mask & (1 << index)), checkbox = $(`${area}-enabled`);
      if (checkbox.checked !== enabled) checkbox.click();
    }
    for (const area of ['chat', 'sidebar', 'right', 'terminal']) {
      const enabled = $(`${area}-enabled`).checked, pane = document.querySelector(`.mock-pane[data-area="${area}"]`);
      assert(pane.dataset.selected === String(enabled) && !!pane.style.background === enabled, `${mask}: ${area} preview selection mismatch`);
      assert($(`${area}-fade`).hidden === !enabled, `${mask}: ${area} fader visibility mismatch`);
      assert((getComputedStyle(pane).textShadow !== 'none') === enabled, `${mask}: ${area} outline selection mismatch`);
    }
    assert($('wallpaper-apply').disabled === (mask === 0), `${mask}: Apply requires at least one pane`);
  }
  $('right-veil').focus();
  const highlighted = selector => getComputedStyle(document.querySelector(selector)).getPropertyValue('--highlight-opacity').trim() === '.7';
  assert(highlighted('.mock-panel'), 'focusing a fader must identify its preview pane');
  $('wallpaper-veil').focus();
  assert(!highlighted('.mock-panel') && highlighted('.mock-chat'), 'focus highlight must follow the current fader');
  $('show-labels').click(); assert($('preview').dataset.labels === 'false', 'pane labels must be hideable');
  assert([...document.querySelectorAll('.pane-tag')].every(tag => tag.getAttribute('aria-hidden') === 'true'), 'decorative pane tags must not duplicate accessible pane names');
  $('show-labels').click(); assert($('preview').dataset.labels === 'true', 'pane labels must be restorable');
  const previewParent = document.querySelector('.preview-section').parentElement;
  for (const id of ['wallpaper-save', 'wallpaper-apply']) assert($(id).closest('.wallpaper-editor') && !$(id).closest('.preview-stage'), `${id} must be beside the background editing controls`);
  $('show-themes').click();
  for (const id of ['save-open', 'copy']) assert($(id).closest('.theme-controls') && $(id).offsetWidth > 0, `${id} must be beside the theme editing controls in Library view`);
  $('theme-editor-view').click();
  for (const id of ['save-open', 'copy']) assert($(id).offsetWidth > 0, `${id} must remain available in Colors view`);
  $('theme-library-view').click();
  assert(document.documentElement.scrollWidth <= innerWidth && !document.querySelector('.top-actions #quit-prism'), 'Themes header must fit with both icon buttons and Import theme; Quit belongs beside Settings');
  assert(document.querySelector('.preview-section').parentElement === previewParent && document.querySelector('.mock-chat').style.background === '', 'Themes must keep the large preview in place and show palette colors');
  $('show-backgrounds').click();
  assert(document.querySelector('.preview-section').parentElement === previewParent && !!document.querySelector('.mock-chat').style.background, 'Backgrounds must restore the draft without moving the preview');
  chooseLayout('span'); $('right-enabled').click(); $('terminal-enabled').click();
  for (const pane of ['panel', 'terminal']) {
    const element = document.querySelector(`.mock-${pane}`);
    assert(element.style.background === '' && getComputedStyle(element).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(element).textShadow === 'none', `disabled ${pane} must stay opaque and unoutlined over spanning wallpaper`);
  }
  assert(!$('right-image-thumbnail').hidden && !$('terminal-image-thumbnail').hidden, 'disabling optional panels must preserve their selected images');
  $('right-enabled').click(); $('terminal-enabled').click();
  chooseLayout('separate');
  window.__fixture.setChoice('image');
  window.__fixture.setChoice('cancel');
  $('choose-image').click();
  await waitFor(() => !$('choose-image').disabled, 'cancelled picker must unlock controls');
  assert(!$('wallpaper-apply').disabled, 'cancelled picker must preserve both images');
  window.__fixture.setChoice('error');
  $('choose-image').click();
  await waitFor(() => !$('choose-image').disabled, 'failed picker must unlock controls');
  assert($('wallpaper-status').textContent.includes('fixture choice failed'), 'picker error must be shown');
  window.__fixture.setChoice('image');

  const history = [...document.querySelectorAll('.history-choice')];
  assert(history.length === 4, 'history must cap the visible entries at four');
  chooseLayout('duplicate');
  document.querySelector('[data-open="history-dialog"]').click();
  assert($('history-dialog').open, 'History trigger must open its dialog');
  history[1].click();
  await waitFor(() => document.querySelector('input[name=layout]:checked').value === 'separate' && $('clear-text').checked, 'history selection did not restore the saved setup');
  assert(!$('history-dialog').open, 'successful history load must close the dialog');
  assert($('sidebar-veil').value === '95', 'saved linked profile should follow chat fading');
  assert($('right-veil').value === '62' && $('terminal-veil').value === '64', 'saved profile should restore independent right panel and terminal fading');
  assert(!$('right-enabled').checked && !$('terminal-enabled').checked && $('right-fade').hidden && $('terminal-fade').hidden, 'saved profiles without opt-in flags must restore both optional panels off');
  assert(!$('wallpaper-apply').disabled, 'restored setup should remain ready to apply');
  $('right-enabled').click(); $('terminal-enabled').click();

  $('wallpaper-apply').click();
  assert($('wallpaper-apply').textContent === 'Applying…' && $('wallpaper-apply').getAttribute('aria-busy') === 'true', 'Apply must show its busy state immediately');
  assert($('wallpaper-veil').disabled && $('right-enabled').disabled && $('terminal-enabled').disabled && $('reset-fading').disabled && document.querySelector('.history-choice').disabled, 'editing, panel opt-ins, reset and history must lock while Apply is pending');
  assert(JSON.stringify(window.__fixture.getLastApply()) === JSON.stringify({ mode:'separate', veil:.85, sidebarVeil:.95, rightVeil:.62, terminalVeil:.64, sidebarLinked:true, rightLinked:false, terminalLinked:false, chatEnabled:true, sidebarEnabled:true, rightEnabled:true, terminalEnabled:true, clearText:true, soften:false }), 'Apply must forward independent scalar settings and opt-ins without image payloads');
  await waitFor(() => $('wallpaper-apply').textContent === 'Applied ✓' && $('wallpaper-status').classList.contains('success'), 'Apply did not reach success');
  window.__fixture.emitConnection({ code:'applied', detail:'', autoStart:false, saved:true });
  assert($('wallpaper-apply').textContent === 'Applied ✓', 'Repeated keeper confirmation must preserve applied state');
  assert(!$('wallpaper-veil').disabled, 'editing must unlock after Apply');

  const selectedPictures = ['image-thumbnail','sidebar-image-thumbnail','right-image-thumbnail','terminal-image-thumbnail'].map(id => $(id).src);
  $('reset-fading').click();
  assert($('wallpaper-veil').value === '75' && ['sidebar-veil','right-veil','terminal-veil'].every(id => $(id).value === '85'), 'reset must restore 75% chat and 85% panel fading');
  assert($('right-enabled').checked && $('terminal-enabled').checked, 'reset fading must preserve optional panel choices');
  assert(document.querySelector('input[name=layout]:checked').value === 'separate' && selectedPictures.every((src,i) => src === $(['image-thumbnail','sidebar-image-thumbnail','right-image-thumbnail','terminal-image-thumbnail'][i]).src), 'reset fading must preserve the selected layout and images');
  $('wallpaper-veil').value = '95'; $('wallpaper-veil').dispatchEvent(new Event('input', { bubbles: true }));
  assert(['sidebar-veil','right-veil','terminal-veil'].every(id => $(id).value === '100'), 'reset must relink every panel and cap fading at 100%');
  $('reset-fading').click(); $('wallpaper-apply').click();
  assert(JSON.stringify(window.__fixture.getLastApply()) === JSON.stringify({ mode:'separate', veil:.75, sidebarVeil:.85, rightVeil:.85, terminalVeil:.85, sidebarLinked:true, rightLinked:true, terminalLinked:true, chatEnabled:true, sidebarEnabled:true, rightEnabled:true, terminalEnabled:true, clearText:true, soften:false }), 'Apply must save the shared defaults, links and optional panel choices');
  await waitFor(() => $('wallpaper-apply').textContent === 'Applied ✓', 'reset settings did not apply');

  window.__fixture.setWaiting(true);
  $('wallpaper-apply').click();
  await waitFor(() => $('connection-title').textContent === 'Quit ChatGPT to finish setup', 'queued Apply must show the ordinary Codex close steps');
  assert($('connection-description').textContent.includes('Save your work') && $('connection-description').textContent.includes('It will reopen Codex'), 'queued setup must explain safe manual close and automatic finish');
  assert(!$('wallpaper-status').classList.contains('success') && $('wallpaper-apply').textContent !== 'Applied ✓', 'waiting must not claim success');
  assert(!$('wallpaper-veil').disabled, 'editing must unlock after waiting');
  window.__fixture.emitConnection({code:'codex-open',backgroundOnly:true,processIds:[412,413],mainProcessIds:[412],autoStart:true,saved:true});
  assert($('connection-title').textContent === 'ChatGPT is still running in the background', 'leftover background processes need an explicit diagnosis');
  $('connection-recovery').click();
  assert($('connection-recovery-dialog').open && $('recovery-processes').textContent.includes('Main ChatGPT.exe PID: 412') && $('recovery-processes').textContent.includes('412, 413'), 'recovery must identify the exact main and child process IDs');
  assert($('connection-recovery-dialog').textContent.includes('End task interrupts running work'), 'forced close guidance must disclose unsaved work loss');
  $('open-task-manager').click();
  await waitFor(() => window.__fixture.taskManagerOpened && !$('open-task-manager').disabled, 'Task Manager button did not reach the host');
  $('connection-recovery-dialog').close();
  $('connection-cancel').click();
  await waitFor(() => $('connection-title').textContent === 'Open Codex through Prism', 'Cancel opening must disarm and restore the connect action');
  assert($('connection-cancel').hidden, 'cancel control must hide after disarming');
  window.__fixture.setWaiting(true); $('wallpaper-apply').click();
  await waitFor(() => $('connection-title').textContent === 'Quit ChatGPT to finish setup', 'second queued Apply did not arm');
  $('wallpaper-veil').value = '77'; $('wallpaper-veil').dispatchEvent(new Event('input', { bubbles:true }));
  window.__fixture.emitConnection({ code:'applied', detail:'', autoStart:false, saved:true }, 'Applied automatically');
  assert($('connection-title').textContent === 'Background applied' && $('wallpaper-apply').textContent === 'Apply' && !$('wallpaper-status').classList.contains('success'), 'host applied event must clear waiting without claiming a dirty draft was applied');
  window.__fixture.emitConnection({ code:'future-error', detail:'Fixture technical detail', autoStart:false, saved:true });
  assert($('connection-title').textContent === 'Prism could not connect' && $('connection-description').textContent.includes('Check the connection again'), 'unknown connection errors need readable fallback guidance');
  $('connection-details').click();
  assert($('connection-details-dialog').open && $('connection-detail-text').textContent === 'Fixture technical detail', 'technical connection detail must be available in the Details dialog');
  $('connection-details-dialog').close();
  window.__fixture.emitConnection({code:'codex-open',autoStart:true,saved:true});
  window.__fixture.holdCheck(); $('connection-check').click();
  assert($('connection-check').disabled && $('wallpaper-apply').disabled && $('wallpaper-remove').disabled, 'connection checks must share the background operation lock');
  assert(!$('connection-cancel').hidden && !$('connection-cancel').disabled, 'Cancel opening must remain available during a slow connection check');
  $('connection-cancel').click();
  await waitFor(() => $('connection-cancel').hidden, 'Cancel must finish before the slow background check');
  assert($('connection-check').disabled, 'cancellation must not unlock an unfinished background operation');
  window.__fixture.finishCheck(); await waitFor(() => !$('connection-check').disabled, 'connection check did not unlock background controls');
  assert($('connection-cancel').hidden && $('connection-title').textContent === 'Open Codex through Prism', 'a completed but delayed pre-cancel response must not restore automatic opening after Cancel');
  window.__fixture.setWaiting(false);

  window.__fixture.setFailApply(true);
  $('wallpaper-apply').click();
  assert($('wallpaper-apply').getAttribute('aria-busy') === 'true', 'failed Apply must still enter its busy state');
  await waitFor(() => $('wallpaper-status').classList.contains('error'), 'Apply error was not surfaced');
  assert($('wallpaper-status').textContent.includes('fixture apply failed'), 'Apply error text was lost');
  assert($('connection-title').textContent === 'Prism could not finish that step', 'Apply failures must use the visible setup panel');
  window.__fixture.emitConnection({ code:'applied', detail:'', autoStart:false, saved:true });
  assert($('connection-title').textContent === 'Prism could not finish that step', 'Background polling must preserve the actionable failure');
  window.__fixture.setFailApply(false);

  const remove = $('wallpaper-remove'), cancel = remove.parentElement.querySelector('.cancel-confirm');
  remove.click();
  assert(remove.textContent === 'Confirm remove' && !cancel.hidden && window.__fixture.removals === 0, 'Remove must ask inline before calling the host');
  cancel.click(); assert(remove.textContent === 'Remove' && window.__fixture.removals === 0, 'Cancel must preserve the active background');
  remove.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
  assert(!remove.dataset.confirming && window.__fixture.removals === 0, 'Escape must cancel inline confirmation');
  remove.click(); $('show-themes').click(); $('show-backgrounds').click();
  assert(!remove.dataset.confirming, 'switching sections must clear stale removal confirmation');
  remove.click(); remove.click();
  assert(window.__fixture.removals === 1, 'a second explicit click must remove exactly once');
  await waitFor(() => !$('wallpaper-remove').disabled, 'Remove must unlock controls');

  for (const code of ['ready', 'codex-closed']) {
    $('wallpaper-apply').click();
    await waitFor(() => $('wallpaper-apply').textContent === 'Applied ✓', 'fixture reapply did not finish');
    const currentImage = $('image-thumbnail').src, currentFade = $('wallpaper-veil').value;
    window.__fixture.emitRemoval(code);
    assert($('wallpaper-apply').textContent === 'Apply' && !$('background-history-list').textContent.includes('Current ·'), 'online and offline tray removal must clear Applied and Current');
    assert($('image-thumbnail').src === currentImage && $('wallpaper-veil').value === currentFade, 'tray removal must preserve the editable preview');
    $('wallpaper-veil').value = '79'; $('wallpaper-veil').dispatchEvent(new Event('input', {bubbles:true}));
    window.__fixture.emitRemoval(code);
    assert($('wallpaper-veil').value === '79' && $('image-thumbnail').src === currentImage, 'tray removal must preserve an unsaved draft');
  }
  window.__fixture.holdApplyResponse(); $('wallpaper-apply').click();
  await waitFor(() => window.__fixture.applyResponseReady(), 'delayed Apply response was not captured');
  window.__fixture.emitRemoval('ready'); window.__fixture.finishApplyResponse();
  await waitFor(() => !$('wallpaper-apply').disabled, 'delayed Apply did not finish');
  assert($('wallpaper-apply').textContent === 'Apply' && !$('background-history-list').textContent.includes('Current ·'), 'an older Apply response must not overwrite a newer tray removal');
  window.__fixture.emitRemoval('ready', true); $('wallpaper-apply').click();
  await waitFor(() => $('wallpaper-apply').textContent === 'Applied ✓', 'new Apply after queued removal did not finish');
  window.__fixture.flushRemoval();
  assert($('wallpaper-apply').textContent === 'Applied ✓' && $('background-history-list').textContent.includes('Current ·'), 'an older tray removal event must not erase a newer Apply');
  window.__fixture.emitRemoval('codex-open'); window.__fixture.setWaiting(true);
  window.__fixture.emitConnection({code:'codex-open',autoStart:true,saved:false});
  window.__fixture.holdApplyResponse(); $('wallpaper-apply').click();
  await waitFor(() => window.__fixture.applyResponseReady(), 'saved waiting Apply was not captured');
  $('connection-cancel').click();
  await waitFor(() => $('connection-cancel').hidden, 'Cancel did not finish before the saved Apply reply');
  window.__fixture.finishApplyResponse();
  await waitFor(() => !$('wallpaper-apply').disabled, 'waiting Apply reply did not finish');
  assert($('background-history-list').textContent.includes('Current ·') && $('connection-cancel').hidden && $('connection-title').textContent === 'Open Codex through Prism', 'Cancel must retain the completed save while rejecting its older automatic-opening status');
  window.__fixture.setWaiting(false);

  await waitFor(() => [...$('ui-font').options].some(option => option.value === 'Fixture Sans'), 'fixture fonts did not populate');
  $('ui-font').value = 'Fixture Sans';
  $('ui-font').dispatchEvent(new Event('change', { bubbles: true }));
  $('copy').click();
  await waitFor(() => $('copy-dialog').open && window.__fixture.getLastCopy(), 'copy dialog did not open');
  const copied = JSON.parse(window.__fixture.getLastCopy().slice('codex-theme-v1:'.length));
  assert(copied.theme.fonts.ui === 'Fixture Sans', 'selected font was missing from copied theme');
  const originalClipboard = window.__fixture.getLastCopy();
  window.__fixture.setClipboard('something else');
  $('open-settings').click();
  await waitFor(() => !$('open-settings').disabled, 'Settings should finish');
  assert(!$('copy-message').textContent.includes('still on the clipboard'), 'Settings must not claim clipboard contents are unchanged');
  $('copy-again').click();
  await waitFor(() => !$('copy-again').disabled, 'recopy should finish');
  assert(window.__fixture.getLastCopy() === originalClipboard, 'Copy again must restore the complete theme');
  for (const dialog of document.querySelectorAll('dialog')) assert(document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent.trim(), 'Every dialog needs an accessible name');
  const tutorial = $('copy-tutorial'), playTutorial = $('play-tutorial');
  playTutorial.click();
  assert(tutorial.src.endsWith('/assets/copy-import.gif') && playTutorial.getAttribute('aria-pressed') === 'true', 'tutorial play must show the walkthrough');
  playTutorial.click();
  assert(tutorial.src.endsWith('/assets/copy-import-poster.png') && playTutorial.getAttribute('aria-pressed') === 'false', 'tutorial stop must restore the poster');
  playTutorial.click();
  $('copy-dialog').close();
  await waitFor(() => tutorial.src.endsWith('/assets/copy-import-poster.png') && playTutorial.getAttribute('aria-pressed') === 'false', 'closing the copy dialog must stop the tutorial');
  $('backup-open').click(); $('backup-text').value = originalClipboard; $('backup-save').click();
  const backupDelete = document.querySelector('.backup-row [data-confirm-label]'), backupCancel = backupDelete.nextElementSibling;
  backupDelete.click(); assert(backupDelete.textContent === 'Confirm delete' && !backupCancel.hidden && $('backups').children.length === 1, 'backup deletion must ask inline');
  backupCancel.click(); assert(backupDelete.textContent === 'Delete' && $('backups').children.length === 1, 'backup cancellation must preserve the original theme');
  backupDelete.click(); backupDelete.click(); assert($('backups').children.length === 0, 'explicit inline confirmation must delete the backup');
  $('backup-dialog').close();

  const input = $('browser-image'), previousReader = window.FileReader;
  const previousFiles = Object.getOwnPropertyDescriptor(input, 'files');
  window.FileReader = class {
    constructor() { this.error = new Error('fixture image read failed'); }
    readAsDataURL() { setTimeout(() => this.onerror?.(new ErrorEvent('error', { message: this.error.message, error: this.error })), 0); }
  };
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['broken'], 'broken.png', { type: 'image/png' })] });
  input.dispatchEvent(new Event('change'));
  await waitFor(() => $('wallpaper-status').classList.contains('error') && $('wallpaper-status').textContent.includes('fixture image read failed'), 'FileReader error was not surfaced');
  window.FileReader = previousReader;
  if (previousFiles) Object.defineProperty(input, 'files', previousFiles); else delete input.files;

  const originalConfirm = window.confirm;
  $('show-backgrounds').click();
  const settingsBox = $('settings-open').getBoundingClientRect(), quitBox = $('quit-prism').getBoundingClientRect();
  assert(!$('settings-dialog').open && quitBox.width > 0 && quitBox.left >= settingsBox.right && quitBox.top === settingsBox.top && quitBox.right <= innerWidth, 'Quit must fit directly beside Settings without opening a dialog');
  $('quit-prism').focus(); assert(document.activeElement === $('quit-prism'), 'Quit must remain keyboard accessible beside Settings');
  for (const dirty of [false, true]) {
    $('reset').click();
    if (dirty) { $('hex-ink').value = '#123456'; $('hex-ink').dispatchEvent(new Event('input', { bubbles: true })); }
    for (const trigger of [() => $('quit-prism').click(), () => window.__fixture.requestQuit()]) {
      window.__fixture.quit = false;
      const prompts = [];
      window.confirm = message => { prompts.push(message); return false; };
      trigger();
      assert(!window.__fixture.quit && prompts.length === 1, 'Both Quit controls must ask and stay open on Cancel, even without edits');
      assert(prompts[0] === (dirty ? 'Are you sure you want to quit Prism? Your unsaved color edits will be lost.' : 'Are you sure you want to quit Prism?'), 'Quit confirmation must include the unsaved-edit warning only when needed');
      window.confirm = message => { prompts.push(message); return true; };
      trigger();
      assert(window.__fixture.quit && prompts.length === 2, 'Both Quit controls must quit only after confirmation');
    }
  }
  window.confirm = originalConfirm;
  document.title = 'PASS · Prism frontend smoke';
  console.log('PASS: frontend smoke');
} catch (error) {
  document.title = 'FAIL · Prism frontend smoke';
  console.error(`FAIL: ${error.stack || error.message || error}`);
  throw error;
}
