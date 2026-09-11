import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { execFile as runProcess } from 'node:child_process';
import { PROBE_WALLPAPER, REMOVE_WALLPAPER, wallpaperOptions } from './wallpaper.mjs';
import { createHash } from 'node:crypto';

test('all verified app windows restore, settings need no composer, and theme changes refresh the outline', async () => {
  const originalLoad = Module._load, originalFetch = globalThis.fetch, originalWebSocket = globalThis.WebSocket;
  const windows = new Map(['A', 'B'].map(id => [id, { shell: true, sidebar: false, composer: false, installed: false, appearance: 'rgb(240,240,240)' }]));
  let installs = 0, removals = 0, verifies = 0, sent = 0, rejectProfile = false;
  const failProbe = new Set(), failMutation = new Set();
  const execFile = () => {}; execFile[promisify.custom] = async () => { verifies++; if (rejectProfile) throw Error('profile rejected'); return { stdout: '{"verified":true}' }; };
  Module._load = function(name, ...args) {
    if (name === 'node:child_process') return { execFile };
    if (name === 'node:net') return { createConnection() { const socket = new EventEmitter(); socket.setTimeout = () => {}; socket.destroy = () => {}; queueMicrotask(() => socket.emit('connect')); return socket; } };
    return originalLoad.call(this, name, ...args);
  };
  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify([...windows.keys()].map(id => ({ id, type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: `ws://127.0.0.1:9339/devtools/page/${id}` })).concat({ id: 'X', type: 'page', url: 'https://example.com', webSocketDebuggerUrl: 'ws://127.0.0.1:9339/devtools/page/X' })) });
  globalThis.WebSocket = class extends EventTarget {
    constructor(url) { super(); this.id = url.split('/').pop(); assert.ok(windows.has(this.id)); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    close() {}
    send(text) {
      const expression = JSON.parse(text).params.expression, state = windows.get(this.id);
      sent++;
      if ((expression === PROBE_WALLPAPER ? failProbe : failMutation).has(this.id)) {
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: 1, result: { exceptionDetails: { text: 'Context destroyed' } } }) })));
        return;
      }
      let value;
      if (expression === PROBE_WALLPAPER) value = state;
      else if (expression === REMOVE_WALLPAPER) { removals++; state.installed = false; value = { removed: true }; }
      else { installs++; state.installed = true; state.appliedAppearance = state.appearance; state.profile = expression.match(/data-prism-profile',"([a-f0-9]+)"/)?.[1]; assert.ok(state.profile); value = { installed: true }; }
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: 1, result: { result: { value } } }) })));
    }
  };
  try {
    const { operate } = createRequire(import.meta.url)('./wallpaper-client.cjs');
    const options = { image: 'data:image/png;base64,AA==', veil: .85, clearText: true };
    const applied = await operate(options, { ensure: true });
    assert.equal(applied.windows, 2); assert.equal(applied.appearance, 'rgb(240,240,240)'); assert.equal(installs, 2);
    const unchanged = await operate(options, { ensure: true });
    assert.equal(unchanged.unchanged, true); assert.equal(unchanged.appearance, applied.appearance); assert.equal(installs, 2);
    const currentStamp = windows.get('A').profile;
    windows.get('A').profile = createHash('sha256').update(JSON.stringify(wallpaperOptions(options))).digest('hex');
    assert.equal((await operate(options, { ensure: true })).installed, true);
    assert.equal(windows.get('A').profile, currentStamp, 'upgrade must replace an older adapter with unchanged image settings');
    installs = 2;
    windows.get('B').appearance = 'rgb(30,30,30)';
    await operate(options, { ensure: true }); assert.equal(installs, 3, 'refresh only the window whose appearance changed');
    windows.set('C', { shell: true, installed: false, appearance: 'rgb(240,240,240)' });
    await operate(options, { ensure: true }); assert.equal(installs, 4, 'new task window receives background');
    assert.equal((await operate(null)).removed, true); assert.equal(removals, 3);
    assert.ok(verifies >= 5);
    failProbe.add('A');
    const partial = await operate(options);
    assert.equal(partial.partial, true); assert.equal(partial.appearance, 'rgb(30,30,30)', 'partial restoration must report the first available window appearance');
    assert.equal(windows.get('B').installed, true, 'healthy windows apply even after a failed probe');
    assert.equal((await operate(null)).removed, undefined, 'partial removal must not claim completion');
    assert.equal(windows.get('B').installed, false);
    failProbe.clear(); failMutation.add('C');
    assert.equal((await operate(options)).partial, true, 'a later failed mutation remains partial');
    failMutation.clear();
    assert.equal((await operate(null)).removed, true, 'later retry completes removal');
    for (const state of windows.values()) state.shell = false;
    const beforeLayoutCheck = installs;
    await assert.rejects(operate(options), /this Codex layout needs a Prism update/);
    assert.equal(installs, beforeLayoutCheck, 'an unrecognized layout must not receive wallpaper');
    for (const state of windows.values()) state.shell = true;
    assert.equal((await operate(options)).installed, true, 'a compatible layout can apply without a version update');
    rejectProfile = true;
    const before = sent;
    await assert.rejects(operate(options)); await assert.rejects(operate(options, { ensure: true })); await assert.rejects(operate(null));
    assert.equal(sent, before, 'profile rejection must prevent every probe and mutation');
  } finally { Module._load = originalLoad; globalThis.fetch = originalFetch; globalThis.WebSocket = originalWebSocket; }
});

test('Windows argument boundary rejects quoted decoys, duplicate switches and missing profile or port', async () => {
  const source = await readFile(new URL('./wallpaper-windows.ps1', import.meta.url), 'utf8');
  const definition = source.match(/function Test-PrismProfile[^]*?(?=\r?\ntry \{)/)?.[0];
  assert.ok(definition);
  const script = `$ErrorActionPreference = 'Stop'
${definition}
$env:LOCALAPPDATA = 'C:\\Users\\Prism Test\\AppData\\Local'
$expected = Join-Path $env:LOCALAPPDATA 'Prism\\wallpaper-codex-profile'
$good = '"C:\\Program Files\\Codex\\app.exe" --remote-debugging-port=9339 --user-data-dir="' + $expected + '"'
Test-PrismProfile $good
Test-PrismProfile ($good + ' --title="a harmless argument"')
foreach ($bad in @(
  'app.exe', 'app.exe --remote-debugging-port=9339 --user-data-dir="C:\\Other"',
  ($good + ' --user-data-dir="C:\\Other"'), ($good + ' --user-data-dir "C:\\Other"'),
  ($good + ' --remote-debugging-port=9444'), ($good + ' --remote-debugging-port 9339'),
  ('app.exe --remote-debugging-port=9339 --title="note --user-data-dir=' + $expected + '"'),
  ('app.exe --title="note --remote-debugging-port=9339" --user-data-dir="' + $expected + '"'),
  ('app.exe -- --remote-debugging-port=9339 --user-data-dir="' + $expected + '"'),
  ('app.exe --remote-debugging-port=9339 --user-data-dir="' + $expected + '-other"'),
  ('app.exe --remote-debugging-port=9339 --user-data-dir="' + $expected + '\\\\" --user-data-dir=C:\\Other'),
  ('app.exe --user-data-dir="' + $expected + '"')
)) {
  $rejected = $false
  try { Test-PrismProfile $bad } catch { $rejected = $true }
  if (!$rejected) { throw 'Invalid profile was accepted' }
}
Write-Output 'PASS profile boundary'`;
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  const { stdout } = await promisify(runProcess)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env, windowsHide: true, timeout: 10000 }).catch(error => { throw Error(error.stderr || error.message); });
  assert.match(stdout, /PASS profile boundary/);
});

test('Windows helper follows the installed package after an update and retains identity checks', async () => {
  const helper = new URL('./wallpaper-windows.ps1', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  for (const scenario of [
    { version: '26.903.8094.0' },
    { version: '26.901.6511.0' },
    { version: '26.903.9818.0' },
    { version: '25.1.1.0' },
    { version: '99.0.0.0' },
    { version: '99.0.0.0', family: 'OpenAI.Codex_impostor', error: /official Codex/ },
    { version: '99.0.0.0', signature: 'NotSigned', error: /signed OpenAI/ },
    { version: '99.0.0.0', owner: 'C:\\Other\\ChatGPT.exe', error: /expected official Codex/ },
    { version: '99.0.0.0', address: '0.0.0.0', error: /loopback/ }
  ]) {
    const location = `D:\\WindowsApps\\OpenAI.Codex_${scenario.version}_x64__2p2nqsd0c76g0`;
    const script = `
$expectedExecutable = ${quote(location + '\\app\\ChatGPT.exe')}
function Get-AppxPackage { param($Name) [pscustomobject]@{ Version=${quote(scenario.version)}; PackageFamilyName=${quote(scenario.family || 'OpenAI.Codex_2p2nqsd0c76g0')}; InstallLocation=${quote(location)} } }
function Test-Path { param($LiteralPath) $LiteralPath -eq $expectedExecutable }
function Get-AuthenticodeSignature { param($LiteralPath) @{ Status=${quote(scenario.signature || 'Valid')}; SignerCertificate=@{Subject='CN="OpenAI OpCo, LLC", O="OpenAI OpCo, LLC", C=US'} } }
function Get-CimInstance { param($ClassName,$Filter) [pscustomobject]@{ ExecutablePath=${quote(scenario.owner || location + '\\app\\ChatGPT.exe')}; CommandLine=('app.exe --remote-debugging-port=9339 --user-data-dir="' + (Join-Path $env:LOCALAPPDATA 'Prism\\wallpaper-codex-profile') + '"') } }
function Get-NetTCPConnection { param($State,$LocalPort,$ErrorAction) [pscustomobject]@{ LocalAddress=${quote(scenario.address || '127.0.0.1')}; OwningProcess=123 } }
& ${quote(fileURLToPath(helper))} -Action Verify`;
    const output = await promisify(runProcess)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env, windowsHide: true, timeout: 10000 }).catch(error => error);
    const result = JSON.parse(output.stdout.trim());
    if (scenario.error) assert.match(result.error || '', scenario.error, JSON.stringify(scenario));
    else { assert.equal(result.verified, true, JSON.stringify(result)); assert.equal(result.version, scenario.version); }
  }
});

test('first-run diagnosis separates ordinary Codex, closed Codex, ready sessions and unsafe connections without launching', async () => {
  const { fileURLToPath } = await import('node:url');
  const helper = fileURLToPath(new URL('./wallpaper-windows.ps1', import.meta.url));
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  for (const scenario of [
    { running: true, code: 'codex-open' },
    { running: true, background: true, code: 'codex-open' },
    { running: false, code: 'codex-closed' },
    { running: true, listener: true, code: 'ready' },
    { running: true, listener: true, otherOwner: true, code: 'port-in-use' },
    { running: true, listener: true, otherProfile: true, code: 'unsafe-session' },
    { running: false, missing: true, code: 'codex-missing' },
    { running: false, version: '99.0.0.0', code: 'codex-closed' }
  ]) {
    const script = `
$expectedExecutable = 'D:\\WindowsApps\\OpenAI.Codex_26.903.8094.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe'
function Get-AppxPackage { param($Name) ${scenario.missing ? 'return' : `[pscustomobject]@{Version=${quote(scenario.version || '26.903.8094.0')};PackageFamilyName='OpenAI.Codex_2p2nqsd0c76g0';InstallLocation='D:\\WindowsApps\\OpenAI.Codex_26.903.8094.0_x64__2p2nqsd0c76g0'}`} }
function Test-Path { param($LiteralPath) $true }
function Get-AuthenticodeSignature { param($LiteralPath) @{Status='Valid';SignerCertificate=@{Subject='O="OpenAI OpCo, LLC"'}} }
function Get-CimInstance { param($ClassName,$Filter) if($Filter -or $${scenario.running}) {[pscustomobject]@{ProcessId=123;ExecutablePath=$(if($Filter -and $${!!scenario.otherOwner}){'C:\\Other.exe'}else{$expectedExecutable});CommandLine=('app.exe --remote-debugging-port=9339 --user-data-dir="' + $(if($${!!scenario.otherProfile}){'C:\\Other'}else{Join-Path $env:LOCALAPPDATA 'Prism\\wallpaper-codex-profile'}) + '"')}} }
function Get-Process { param($Id,$ErrorAction) [pscustomobject]@{MainWindowHandle=${scenario.background ? 0 : 1234}} }
function Get-NetTCPConnection { param($State,$LocalPort,$ErrorAction) ${scenario.listener ? "[pscustomobject]@{LocalAddress='127.0.0.1';OwningProcess=123}" : 'return'} }
function Start-Process { throw 'Diagnosis must not launch Codex' }
& ${quote(helper)} -Action Inspect`;
    const { stdout } = await promisify(runProcess)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env, windowsHide: true, timeout: 10000 });
    const result = JSON.parse(stdout.trim());
    assert.equal(result.code, scenario.code, JSON.stringify(scenario));
    if (scenario.code === 'codex-open') {
      assert.deepEqual(result.processIds,[123]); assert.deepEqual(result.mainProcessIds,[123]);
      assert.equal(result.backgroundOnly,!!scenario.background);
    }
  }
});

test('Show opens only the verified existing Codex profile and refuses unrelated or closed sessions', async () => {
  const { fileURLToPath } = await import('node:url');
  const helper = fileURLToPath(new URL('./wallpaper-windows.ps1', import.meta.url));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  for (const scenario of ['verified','wrong-owner','wrong-profile','non-loopback','closed']) {
    const script = `
$expectedExecutable = 'D:\\WindowsApps\\OpenAI.Codex_26.903.8094.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe'
$expectedProfile = Join-Path $env:LOCALAPPDATA 'Prism\\wallpaper-codex-profile'
function Get-AppxPackage { param($Name) [pscustomobject]@{Version='26.903.8094.0';PackageFamilyName='OpenAI.Codex_2p2nqsd0c76g0';InstallLocation='D:\\WindowsApps\\OpenAI.Codex_26.903.8094.0_x64__2p2nqsd0c76g0'} }
function Test-Path { param($LiteralPath) $true }
function Get-AuthenticodeSignature { param($LiteralPath) @{Status='Valid';SignerCertificate=@{Subject='O="OpenAI OpCo, LLC"'}} }
function Get-CimInstance { param($ClassName,$Filter) [pscustomobject]@{ExecutablePath=${scenario === 'wrong-owner' ? "'C:\\Other\\ChatGPT.exe'" : '$expectedExecutable'};CommandLine=('app.exe --remote-debugging-port=9339 --user-data-dir="'+${scenario === 'wrong-profile' ? "'C:\\Other'" : '$expectedProfile'}+'"')} }
function Get-NetTCPConnection { param($State,$LocalPort,$ErrorAction) ${scenario === 'closed' ? 'return' : `[pscustomobject]@{LocalAddress='${scenario === 'non-loopback' ? '0.0.0.0' : '127.0.0.1'}';OwningProcess=123}`} }
function Start-Process { param($FilePath,$ArgumentList,$WindowStyle)
  [Console]::Error.WriteLine('SHOW_CALLED')
  if($FilePath -ne $expectedExecutable -or @($ArgumentList).Count -ne 1 -or $ArgumentList[0] -ne ('--user-data-dir="'+$expectedProfile+'"')) { throw 'Show must reuse exactly the existing profile, without new debugging flags or a route.' }
}
& ${quote(helper)} -Action Show`;
    const output = await promisify(runProcess)('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], { env,windowsHide:true,timeout:10000 }).catch(error=>error);
    const result = JSON.parse(output.stdout.trim());
    if (scenario === 'verified') { assert.equal(result.opened,true,JSON.stringify(result)); assert.equal((output.stderr.match(/SHOW_CALLED/g) || []).length,1); }
    else { assert.ok(result.error,scenario); assert.ok(!output.stderr.includes('SHOW_CALLED'),scenario+' must never start a process'); }
  }
});
