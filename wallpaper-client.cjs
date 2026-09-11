const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createConnection } = require('node:net');
const run = promisify(execFile);
async function windows(action) {
  // PS scripts cannot execute directly inside ASAR; packaging unpacks this one file.
  const script = path.join(__dirname.replace(/app\.asar$/, 'app.asar.unpacked'), 'wallpaper-windows.ps1');
  // A parent PowerShell 7 module path conflicts with Windows PowerShell 5 built-ins.
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, '-Action', action], { env, windowsHide: true, timeout: 20000, maxBuffer: 65536 });
    return JSON.parse(stdout);
  } catch (error) {
    let message, code;
    try { const result = JSON.parse(error.stdout); message = result.error; code = result.code; } catch {}
    const details = String(error.stderr || '');
    if (!code && /digitally signed|running scripts is disabled|PSSecurityException/i.test(details)) code = 'helper-blocked';
    if (!code && (error.killed || error.code === 'ETIMEDOUT')) code = 'helper-timeout';
    throw Object.assign(new Error(message || details.slice(0, 600).trim() || 'The Windows wallpaper helper could not complete its check.'), { code: code || 'helper-unavailable' });
  }
}
async function connection() {
  const script = path.join(__dirname.replace(/app\.asar$/, 'app.asar.unpacked'), 'wallpaper-windows.ps1');
  try { await require('node:fs/promises').access(script); }
  catch { return { code: 'helper-missing', detail: 'The Windows helper is missing or cannot be read.' }; }
  try {
    const result = await windows('Inspect');
    return typeof result?.code === 'string' ? result : { code: 'helper-unavailable', detail: 'The Windows helper returned no connection diagnosis.' };
  } catch (error) { return { code: error.code, detail: error.message }; }
}
async function endpointAvailable() {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port: 9339 });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(500, () => finish(false));
    socket.once('connect', () => finish(true)); socket.once('error', () => finish(false));
  });
}
async function evaluate(socketUrl, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const timer = setTimeout(() => finish(new Error('Codex did not answer within 8 seconds.')), 8000);
    let finished = false;
    function finish(error, result) { if (finished) return; finished = true; clearTimeout(timer); try { socket.close(); } catch {} error ? reject(error) : resolve(result); }
    socket.addEventListener('close', () => finish(new Error('Codex closed the local connection.')));
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })));
    socket.addEventListener('error', () => finish(new Error('The local Codex connection failed.')));
    socket.addEventListener('message', event => {
      let result; try { result = JSON.parse(event.data); } catch { return; }
      if (result.id !== 1) return;
      if (result.error || result.result?.exceptionDetails) return finish(new Error('Codex rejected this wallpaper operation. Its layout or policy may have changed.'));
      finish(null, result.result?.result?.value);
    });
  });
}
async function operate(options, { ensure = false } = {}) {
  const { targetSocket, wallpaperOptions, wallpaperExpression, PROBE_WALLPAPER, REMOVE_WALLPAPER } = await import('./wallpaper.mjs');
  const checked = options === null ? null : wallpaperOptions(options);
  const install = checked && wallpaperExpression(checked);
  const stamp = install && createHash('sha256').update(install).digest('hex');
  if (!await endpointAvailable()) throw new Error('Waiting for wallpaper access. Use Open Codex in Prism.');
  await windows('Verify');
  const response = await fetch('http://127.0.0.1:9339/json/list', { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Could not read the verified local Codex targets.');
  const body = await response.text();
  if (body.length > 1024 * 1024) throw new Error('Unexpected endpoint response.');
  const targets = JSON.parse(body), eligible = [];
  let failed = 0;
  if (!Array.isArray(targets) || targets.length > 50) throw new Error('Unexpected endpoint targets.');
  for (const target of targets) {
    let socket; try { socket = targetSocket(target); } catch { continue; }
    try {
      const probe = await evaluate(socket, PROBE_WALLPAPER);
      if (probe?.shell || (checked === null && probe?.installed)) eligible.push({ socket, probe });
    } catch { failed++; }
  }
  if (!eligible.length) throw new Error('Codex is still opening. Open a task or Settings and try Apply again. If it stays unavailable, this Codex layout needs a Prism update.');
  // ponytail: one preview follows the first available window; add a selector if per-window themes are needed.
  const appearance = eligible[0].probe.appearance;
  const pending = eligible.filter(({ probe }) => !(ensure && probe.profile === stamp && probe.installed && probe.appearance === probe.appliedAppearance));
  if (!pending.length && !failed) return { installed: true, unchanged: true, windows: eligible.length, appearance };
  await windows('Verify');
  const expression = checked === null ? REMOVE_WALLPAPER : `(() => { const result = ${install}; document.documentElement.setAttribute('data-prism-profile',${JSON.stringify(stamp)}); return result; })()`;
  for (const target of pending) {
    try {
      const result = await evaluate(target.socket, expression);
      if (!(checked === null ? result?.removed : result?.installed)) failed++;
    } catch { failed++; }
  }
  if (failed) return { waiting: true, partial: true, failed, windows: eligible.length, appearance, message: `Updated available Codex windows. ${failed} window(s) could not be reached; Prism will retry.` };
  return checked === null ? { removed: true, windows: eligible.length, appearance } : { installed: true, windows: eligible.length, appearance };
}
module.exports = { windows, connection, operate, endpointAvailable };
